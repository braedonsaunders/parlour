import {
  createSession,
  defineConfig,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type Move,
} from '@parlour/engine';
import { blitzConfigSchema, createBlitzDef } from '@parlour/game-blitz';
import { describe, expect, it, vi } from 'vitest';
import {
  EMOTES,
  EngineAuthority,
  HEARTBEAT_TIMEOUT_MS,
  MultiplayerState,
  NostrSignaling,
  P2PTransport,
  normalizeRoomCode,
  roomJoinUrl,
  validateRoomCode,
  validateEmote,
} from './index';

type CounterRules = Record<string, ConfigFieldValue>;
type CounterState = { count: number };

const counterConfig = defineConfig<CounterRules>([], []);
const increment: Move<CounterState> = {
  validate: () => true,
  apply: (state) => ({ count: state.count + 1 }),
};
const counterFlow: Flow<CounterState> = {
  start: () => ({ phase: 'play', actor: 0, round: 1 }),
  legalMoves: () => [{ id: 'increment' }],
  advance: () => ({ phase: { phase: 'play', actor: 0, round: 1 } }),
};
const counterGame: GameDef<CounterState, CounterRules> = {
  id: 'counter',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema: counterConfig,
  setup: () => ({ count: 0 }),
  moves: { increment },
  flow: counterFlow,
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

function counterAuthority() {
  return new EngineAuthority({
    def: counterGame,
    session: createSession(counterGame, { seed: 7, config: {}, seats: 2 }),
    settings: { gameId: 'counter', seats: 2, config: {} },
    now: () => 100,
  });
}

describe('room identity', () => {
  it('normalizes input separately from validating an unambiguous four-character code', () => {
    expect(normalizeRoomCode(' ab2z ')).toBe('AB2Z');
    expect(normalizeRoomCode('OI10')).toBe('OI10');
    expect(validateRoomCode('OI10').ok).toBe(false);
    expect(validateRoomCode('ABC').ok).toBe(false);
    expect(roomJoinUrl('https://parlour.app/', 'ab2z')).toBe('https://parlour.app/join/?code=AB2Z');
  });
});

describe('resilience state', () => {
  it('broadcasts versioned seats to every guest and preserves them through host loss', () => {
    const host = new MultiplayerState('peer-a', 'peer-a');
    host.assignSeat(0, 'peer-a', 'profile-a');
    host.assignSeat(1, 'peer-b', 'profile-b');
    host.assignSeat(2, 'peer-c', 'profile-c');

    const guests = ['peer-b', 'peer-c', 'peer-d'].map(
      (peerId) => new MultiplayerState(peerId, 'peer-a'),
    );
    for (const guest of guests) guest.applyPresence(host.exportPresence(), 4);

    host.assignSeat(3, 'peer-d', 'profile-d');
    const joined = host.exportPresence();
    for (const guest of guests) guest.applyPresence(joined, 4);

    for (const guest of guests) {
      expect(guest.seats.get(3)).toEqual({
        peerId: 'peer-d',
        profileId: 'profile-d',
        bot: false,
      });
      guest.seePeer('peer-a', 0);
      for (const peerId of ['peer-b', 'peer-c', 'peer-d']) guest.seePeer(peerId, 1_000);
    }

    for (const guest of guests) {
      expect(guest.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1).hostId).toBe('peer-b');
    }
    const migration = guests[0]!.exportPresence();
    for (const guest of guests.slice(1)) guest.applyPresence(migration, 4);

    for (const guest of guests) {
      expect([...guest.seats]).toEqual([
        [0, { peerId: 'peer-a', profileId: 'profile-a', bot: true }],
        [1, { peerId: 'peer-b', profileId: 'profile-b', bot: false }],
        [2, { peerId: 'peer-c', profileId: 'profile-c', bot: false }],
        [3, { peerId: 'peer-d', profileId: 'profile-d', bot: false }],
      ]);
      expect(guest.exportPresence()).toEqual(guests[0]!.exportPresence());
    }
  });

  it('rejects malformed and same-version conflicting presence snapshots', () => {
    const state = new MultiplayerState('peer-b', 'peer-a');
    state.applyPresence(
      {
        version: 1,
        seats: [[0, { peerId: 'peer-a', profileId: 'profile-a', bot: false }]],
      },
      4,
    );

    expect(() =>
      state.applyPresence(
        {
          version: 1,
          seats: [[0, { peerId: 'peer-z', profileId: 'profile-z', bot: false }]],
        },
        4,
      ),
    ).toThrow('conflicting presence snapshot');
    expect(() =>
      state.applyPresence(
        {
          version: 2,
          seats: [[4, { peerId: 'peer-z', profileId: 'profile-z', bot: false }]],
        },
        4,
      ),
    ).toThrow('invalid presence snapshot');
  });

  it('resends pending work after host election', () => {
    const state = new MultiplayerState('peer-c', 'peer-a');
    state.trackPending({ id: 'pending-1', seat: 1, move: 'draw' });
    state.seePeer('peer-a', 0);
    state.seePeer('peer-b', 1_000);
    state.seePeer('peer-c', 1_000);
    expect(state.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1)).toEqual({
      changed: true,
      hostId: 'peer-b',
      resend: [{ id: 'pending-1', seat: 1, move: 'draw' }],
    });
  });

  it('rejects a delayed duplicate after host kill beyond the old cache bound', async () => {
    const originalHost = counterAuthority();
    await originalHost.apply({ id: 'delayed', seat: 0, move: 'increment' });
    for (let index = 0; index < 2_049; index++) {
      await originalHost.apply({ id: `later-${index}`, seat: 0, move: 'increment' });
    }

    const electedGuest = counterAuthority();
    await electedGuest.importSnapshot(originalHost.exportSnapshot());
    expect(() => electedGuest.apply({ id: 'delayed', seat: 0, move: 'increment' })).toThrow(
      'duplicate action',
    );
    expect(electedGuest.getSession().state.count).toBe(2_050);
    expect(electedGuest.exportSnapshot().acceptedActions).toHaveLength(2_050);
  });

  it('rejects snapshots whose accepted action history does not cover the replay log', async () => {
    const host = counterAuthority();
    await host.apply({ id: 'first', seat: 0, move: 'increment' });
    await host.apply({ id: 'second', seat: 0, move: 'increment' });
    const snapshot = host.exportSnapshot();
    snapshot.acceptedActions.pop();

    expect(() => counterAuthority().importSnapshot(snapshot)).toThrow(
      'accepted action history does not cover replay log',
    );
  });

  it('turns an expired human seat into a bot and lets its profile reclaim it', () => {
    const state = new MultiplayerState('host', 'host');
    state.assignSeat(2, 'peer-z', 'profile-z');
    state.seePeer('peer-z', 0);
    state.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1);
    expect(state.seats.get(2)?.bot).toBe(true);
    expect(state.reclaimSeat('peer-new', 'profile-z')).toBe(2);
    expect(state.seats.get(2)).toEqual({
      peerId: 'peer-new',
      profileId: 'profile-z',
      bot: false,
    });
  });

  it('never expires the local host while checking silent remote links', () => {
    const state = new MultiplayerState('host', 'host');
    state.assignSeat(0, 'host', 'local-profile');
    state.seePeer('host', 0);
    expect(state.expireAndElect(HEARTBEAT_TIMEOUT_MS * 2)).toEqual({
      changed: false,
      hostId: 'host',
      resend: [],
    });
    expect(state.seats.get(0)?.bot).toBe(false);
  });

  it('requests a snapshot only when an applied hash diverges', () => {
    const state = new MultiplayerState('guest', 'host');
    expect(state.checkHash(4, 'same', 'same')).toBeNull();
    expect(state.checkHash(5, 'local', 'remote')).toEqual({ expectedSeq: 5 });
  });
});

describe('quick emotes', () => {
  it('allows the fixed wheel and rate limits spam', () => {
    const clock = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    expect(validateEmote(EMOTES[0]!, -Infinity, clock)).toEqual({ ok: true, sentAt: 1_000 });
    expect(validateEmote(EMOTES[1]!, 1_000, clock)).toEqual({ ok: false, reason: 'rate-limited' });
    expect(validateEmote('raw chat', -Infinity, () => 2_000)).toEqual({
      ok: false,
      reason: 'unsupported-emote',
    });
  });
});

describe('divergence recovery', () => {
  it('notifies a snapshot subscriber exactly once with the atomically corrected snapshot', async () => {
    const def = createBlitzDef();
    const config = blitzConfigSchema.defaults();
    const settings = { gameId: 'blitz', seats: 2, config };
    const host = new EngineAuthority({
      def,
      session: createSession(def, { seed: 7, config, seats: 2 }),
      settings,
      now: () => 100,
    });
    const authority = new EngineAuthority({
      def,
      session: createSession(def, { seed: 7, config, seats: 2 }),
      settings,
    });
    const initial = authority.exportSnapshot();
    const actor = host.getSession().phase.actor!;
    const move = def.flow.legalMoves(host.getSession().state, host.getSession().phase)[0]!;
    const packet = host.apply({
      id: 'action-1',
      seat: actor,
      move: move.id,
      payload: move.payload,
    });
    const corrected = host.exportSnapshot();
    vi.spyOn(authority, 'applyRemote').mockReturnValue({
      stateHash: initial.stateHash,
      accepted: true,
    });
    const importSnapshot = vi.spyOn(authority, 'importSnapshot');
    const signaling = new NostrSignaling({
      relays: [],
      pool: {
        ensureRelay: vi.fn(),
        publish: vi.fn(() => []),
        querySync: vi.fn(async () => []),
        subscribeMany: vi.fn(() => ({ close() {} })),
        close: vi.fn(),
      },
    });
    const transport = new P2PTransport({
      authority,
      profileId: 'guest-profile',
      signaling,
      origin: 'https://parlour.test',
    });
    const harness = transport as unknown as {
      startRoom(code: string, hostId: string): void;
      receiveWire(peerId: string, message: unknown): Promise<void>;
      sendTo: ReturnType<typeof vi.fn>;
    };
    harness.sendTo = vi.fn();
    harness.startRoom('AB2Z', 'host');
    const observations: unknown[] = [];
    transport.onSnapshot((notification) => {
      observations.push({ notification, authority: authority.exportSnapshot() });
    });

    await harness.receiveWire('host', {
      type: 'applied',
      packet,
    });
    expect(harness.sendTo).toHaveBeenCalledWith('host', {
      type: 'sync.request',
      expectedSeq: 0,
    });
    expect(observations).toEqual([]);

    const migration = { replay: corrected, presence: { version: 0, seats: [] } };
    await harness.receiveWire('host', { type: 'sync.snapshot', snapshot: migration });
    await harness.receiveWire('host', { type: 'sync.snapshot', snapshot: migration });

    expect(observations).toEqual([
      {
        notification: { kind: 'snapshot', reason: 'divergence', snapshot: corrected },
        authority: corrected,
      },
    ]);
    expect(importSnapshot).toHaveBeenCalledOnce();
    transport.close();
  });
});
