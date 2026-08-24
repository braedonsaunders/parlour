import { describe, expect, it, vi } from 'vitest';
import { dispatchWireData, parseWire } from './wireSchema';

const snapshot = {
  seed: 42,
  log: [{ seq: 0, seat: 0, move: 'deal', payload: { card: 'HA' }, ts: 1 }],
  acceptedActions: [{ id: 'deal-action', seq: 0 }],
  stateHash: 'hash',
  settings: { gameId: 'blitz', seats: 4, config: { lives: 3, honorRound: false } },
};

const migration = {
  replay: snapshot,
  presence: {
    version: 1,
    seats: [[0, { peerId: 'host', profileId: 'profile', bot: false }]],
  },
};

const profile = { profileId: 'profile', name: 'Juniper', avatarId: 'ember' };

const validMessages = [
  { type: 'hello', profile },
  {
    type: 'welcome',
    hostId: 'host',
    seat: 1,
    peers: [{ peerId: 'host', profile }],
    snapshot: migration,
  },
  { type: 'mesh.peers', peers: [{ peerId: 'peer', profile }] },
  { type: 'presence.state', presence: migration.presence },
  {
    type: 'intent',
    action: {
      id: 'action',
      seat: 1,
      move: 'draw',
      payload: null,
      recycle: { retire: ['H2', 'D4'], issue: ['v#52', 'v#53'] },
    },
  },
  {
    type: 'applied',
    packet: {
      actionId: 'action',
      events: [
        {
          seq: 1,
          seat: 1,
          move: 'draw',
          atMs: 25,
          automatic: false,
          injected: false,
          recycle: { retire: ['H2', 'D4'], issue: ['v#52', 'v#53'] },
          hash: 'event-hash',
        },
      ],
      fx: [{ kind: 'card.draw', payload: { card: 'H2' }, at: 0 }],
      stateHash: 'hash',
    },
  },
  { type: 'heartbeat', sentAt: 1 },
  { type: 'host.changed', hostId: 'host', snapshot: migration },
  { type: 'sync.request', expectedSeq: 2 },
  { type: 'sync.snapshot', snapshot: migration },
  { type: 'emote', emote: 'gg' },
] as const;

describe('wire message schema', () => {
  it.each(validMessages)('accepts $type', (message) => {
    expect(parseWire(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ['unknown discriminator', { type: 'admin', action: {} }],
    ['unexpected field', { type: 'heartbeat', sentAt: 1, action: {} }],
    ['empty identity', { type: 'hello', profile: { ...profile, profileId: '' } }],
    ['oversized identity', { type: 'hello', profile: { ...profile, profileId: 'x'.repeat(129) } }],
    [
      'malformed welcome seats',
      {
        type: 'welcome',
        hostId: 'host',
        seat: 1,
        peers: [],
        snapshot: {
          ...migration,
          presence: {
            version: 1,
            seats: [[4, { peerId: 'host', profileId: 'profile', bot: false }]],
          },
        },
      },
    ],
    ['fractional seat', { type: 'intent', action: { id: 'a', seat: 1.5, move: 'draw' } }],
    ['out-of-range seat', { type: 'intent', action: { id: 'a', seat: 4, move: 'draw' } }],
    [
      'old recycle pairing that leaks the mapping',
      { type: 'intent', action: { id: 'a', seat: 1, move: 'draw', conceals: [['H2', 'v#52']] } },
    ],
    [
      'recycle that changes the deck size',
      {
        type: 'intent',
        action: {
          id: 'a',
          seat: 1,
          move: 'draw',
          recycle: { retire: ['H2'], issue: ['v#52', 'v#53'] },
        },
      },
    ],
    ['negative sequence', { type: 'sync.request', expectedSeq: -1 }],
    ['non-finite timestamp', '{"type":"heartbeat","sentAt":1e400}'],
    ['empty host change identity', { type: 'host.changed', hostId: '', snapshot: migration }],
    ['unsupported emote', { type: 'emote', emote: 'raw chat' }],
    [
      'too many peers',
      {
        type: 'mesh.peers',
        peers: Array.from({ length: 5 }, (_, index) => ({
          peerId: `peer-${index}`,
          profile: { ...profile, profileId: `profile-${index}` },
        })),
      },
    ],
    [
      'invalid nested snapshot',
      {
        type: 'sync.snapshot',
        snapshot: {
          ...migration,
          replay: { ...snapshot, settings: { ...snapshot.settings, seats: 5 } },
        },
      },
    ],
    [
      'invalid nested event',
      {
        type: 'applied',
        packet: {
          actionId: 'action',
          events: [{ seq: 1, seat: 1, move: '' }],
          fx: [],
          stateHash: 'hash',
        },
      },
    ],
    ['oversized packet', 'x'.repeat(512_001)],
  ])('rejects %s', (_label, value) => {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    expect(parseWire(data)).toBeNull();
  });

  it('never throws while fuzzing JSON values', () => {
    let seed = 0x1234abcd;
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const value = (depth: number): unknown => {
      const choice = Math.floor(random() * (depth === 0 ? 4 : 7));
      if (choice === 0) return null;
      if (choice === 1) return random() < 0.5;
      if (choice === 2) return Math.floor(random() * 20) - 10;
      if (choice === 3) return String.fromCharCode(32 + Math.floor(random() * 90)).repeat(3);
      if (choice === 4)
        return Array.from({ length: Math.floor(random() * 5) }, () => value(depth - 1));
      const record: Record<string, unknown> = {};
      for (let index = 0; index < Math.floor(random() * 5); index++) {
        record[`key${index}`] = value(depth - 1);
      }
      if (choice === 6)
        record.type = validMessages[Math.floor(random() * validMessages.length)]!.type;
      return record;
    };

    for (let index = 0; index < 2_000; index++) {
      expect(() => parseWire(JSON.stringify(value(5)))).not.toThrow();
    }
  });
});

describe('wire ingress dispatch', () => {
  it('reports malformed packets without invoking the stateful receiver', () => {
    const receive = vi.fn();
    const report = vi.fn();
    dispatchWireData('{"type":"intent","action":null}', receive, report);
    expect(receive).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('Malformed multiplayer packet');
  });

  it('rejects non-text channel payloads at the same boundary', () => {
    const receive = vi.fn();
    const report = vi.fn();
    dispatchWireData(new ArrayBuffer(4), receive, report);
    expect(receive).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('Malformed multiplayer packet');
  });

  it('reports async receiver rejection without an unhandled promise', async () => {
    const report = vi.fn();
    dispatchWireData(
      JSON.stringify({ type: 'heartbeat', sentAt: 1 }),
      async () => {
        throw new Error('adapter rejected packet');
      },
      report,
    );
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledWith('Multiplayer packet rejected: adapter rejected packet');
    });
  });
});
