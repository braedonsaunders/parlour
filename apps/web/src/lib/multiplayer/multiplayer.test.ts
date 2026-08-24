import { createSession } from '@parlour/engine';
import { blitzConfigSchema, createBlitzDef } from '@parlour/game-blitz';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_CACHE_LIMIT,
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

describe('room identity', () => {
  it('normalizes input separately from validating an unambiguous four-character code', () => {
    expect(normalizeRoomCode(' ab2z ')).toBe('AB2Z');
    expect(normalizeRoomCode('OI10')).toBe('OI10');
    expect(validateRoomCode('OI10').ok).toBe(false);
    expect(validateRoomCode('ABC').ok).toBe(false);
    expect(roomJoinUrl('https://parlour.app/', 'ab2z')).toBe('https://parlour.app/join/AB2Z');
  });
});

describe('resilience state', () => {
  it('deduplicates actions with a bounded cache and resends pending work after host election', () => {
    const state = new MultiplayerState('peer-c', 'peer-a');
    expect(state.acceptAction('action-1')).toBe(true);
    expect(state.acceptAction('action-1')).toBe(false);
    for (let index = 2; index <= ACTION_CACHE_LIMIT + 2; index++) {
      state.acceptAction(`action-${index}`);
    }
    expect(state.seenActionCount).toBe(ACTION_CACHE_LIMIT);

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
    vi.spyOn(authority, 'applyRemote').mockReturnValue(initial.stateHash);
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

    await harness.receiveWire('host', { type: 'sync.snapshot', snapshot: corrected });
    await harness.receiveWire('host', { type: 'sync.snapshot', snapshot: corrected });

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
