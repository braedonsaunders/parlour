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
  AWAY_GRACE_MS,
  EMOTES,
  EngineAuthority,
  HEARTBEAT_TIMEOUT_MS,
  ISOLATION_GRACE_MS,
  MultiplayerState,
  NostrSignaling,
  P2PTransport,
  normalizeRoomCode,
  roomJoinUrl,
  validateRoomCode,
  validateEmote,
} from './index';
import type { PresenceSnapshot } from './types';
import { rematchDealSeed } from './dealSeed';

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
      term: 1,
      resend: [{ id: 'pending-1', seat: 1, move: 'draw' }],
      isolated: false,
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

  it('releases an expired lobby seat instead of handing it to a bot', () => {
    const state = new MultiplayerState('host', 'host');
    state.assignSeat(1, 'peer-z', 'profile-z');
    state.seePeer('peer-z', 0);
    state.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(false);
  });

  /*
   * Reported from a real lobby: switching to messages for a moment lost the
   * seat. A backgrounded page is frozen — no timers, no heartbeats — so three
   * and a half seconds of silence arrives on schedule and means nothing.
   */
  it('holds the chair of a peer that said it was backgrounding', () => {
    const state = new MultiplayerState('host', 'host');
    state.assignSeat(1, 'peer-z', 'profile-z');
    state.seePeer('peer-z', 0);
    state.holdAway('peer-z', 0);

    state.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(true);

    // Still theirs a minute later, and gone once the grace runs out — a chair
    // nobody comes back to has to free up eventually.
    state.expireAndElect(60_000, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(true);
    state.expireAndElect(AWAY_GRACE_MS + 1, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(false);
  });

  it('drops the hold the moment that peer speaks again', () => {
    const state = new MultiplayerState('host', 'host');
    state.assignSeat(1, 'peer-z', 'profile-z');
    state.holdAway('peer-z', 0);
    state.seePeer('peer-z', 1_000);

    // Back at the table: silence is judged from its return, not from its leave.
    expect(state.isAway('peer-z', 2_000)).toBe(false);
    state.expireAndElect(1_000 + HEARTBEAT_TIMEOUT_MS, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(true);
    state.expireAndElect(1_000 + HEARTBEAT_TIMEOUT_MS + 1, HEARTBEAT_TIMEOUT_MS, true);
    expect(state.seats.has(1)).toBe(false);
  });

  /*
   * The other end of the same fault, and the one that closed the room: a device
   * whose own clock stopped comes back to find everybody apparently overdue.
   */
  it('writes off the silence a device did not hear because it was asleep', () => {
    const state = new MultiplayerState('guest', 'host');
    state.assignSeat(0, 'host', 'profile-host');
    state.seePeer('host', 0);

    state.forgiveSilence(120_000);
    expect(state.expireAndElect(120_000, HEARTBEAT_TIMEOUT_MS, true)).toMatchObject({
      changed: false,
      hostId: 'host',
    });
    expect(state.seats.has(0)).toBe(true);
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
      term: 0,
      resend: [],
      isolated: false,
    });
    expect(state.seats.get(0)?.bot).toBe(false);
  });

  it('requests a snapshot only when an applied hash diverges', () => {
    const state = new MultiplayerState('guest', 'host');
    expect(state.checkHash(4, 'same', 'same')).toBeNull();
    expect(state.checkHash(5, 'local', 'remote')).toEqual({ expectedSeq: 5 });
  });

  it('orders competing same-term host claims so healed partitions converge', () => {
    const left = new MultiplayerState('peer-b', 'peer-a');
    left.seePeer('peer-a', 0);
    left.seePeer('peer-c', 1_000);
    const right = new MultiplayerState('peer-c', 'peer-a');
    right.seePeer('peer-a', 0);

    expect(left.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1)).toMatchObject({
      hostId: 'peer-b',
      term: 1,
    });
    expect(right.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1)).toMatchObject({
      hostId: 'peer-c',
      term: 1,
    });

    expect(right.considerHostClaim('peer-b', 1)).toBe(true);
    expect(left.considerHostClaim('peer-c', 1)).toBe(false);
    expect(left.hostId).toBe('peer-b');
    expect(right.hostId).toBe('peer-b');
  });

  it('rejects election-term leaps and claims that are not the deterministic live candidate', () => {
    const state = new MultiplayerState('peer-c', 'peer-a');
    state.seePeer('peer-a', 1_000);
    state.seePeer('peer-b', 1_000);

    expect(state.considerHostClaim('peer-b', 99)).toBe(false);
    expect(state.considerHostClaim('peer-c', 1)).toBe(false);
    expect(state.hostId).toBe('peer-a');
    expect(state.electionTerm).toBe(0);
  });

  it('lets a winning host term authoritatively replace a conflicting presence snapshot', () => {
    const state = new MultiplayerState('peer-c', 'peer-a');
    state.applyPresence(
      {
        version: 1,
        seats: [[0, { peerId: 'peer-a', profileId: 'profile-a', bot: false }]],
      },
      4,
    );
    const winner: PresenceSnapshot = {
      version: 1,
      seats: [[1, { peerId: 'peer-b', profileId: 'profile-b', bot: false }]],
    };

    expect(() => state.applyPresence(winner, 4)).toThrow('conflicting presence snapshot');
    expect(state.applyPresence(winner, 4, true)).toBe(true);
    expect(state.exportPresence()).toEqual(winner);
  });

  it('adopts a winning recurring host claim and requests its snapshot after a partition heals', async () => {
    const authority = counterAuthority();
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
      profileId: 'profile-c',
      signaling,
      origin: 'https://parlour.test',
    });
    const harness = transport as unknown as {
      resilience: MultiplayerState;
      pendingResync: boolean;
      pendingHostMigration: boolean;
      startRoom(code: string, hostId: string): void;
      receiveWire(peerId: string, message: unknown): Promise<void>;
      sendTo: ReturnType<typeof vi.fn>;
    };
    harness.sendTo = vi.fn();
    harness.startRoom('AB2Z', signaling.publicKey);
    harness.resilience.considerHostClaim(signaling.publicKey, 1, true);
    harness.resilience.applyPresence(
      {
        version: 1,
        seats: [[0, { peerId: signaling.publicKey, profileId: 'profile-c', bot: false }]],
      },
      2,
    );
    const winningHost = '0'.repeat(64);

    await harness.receiveWire(winningHost, {
      type: 'heartbeat',
      sentAt: 100,
      hostId: winningHost,
      term: 1,
    });

    expect(harness.resilience.hostId).toBe(winningHost);
    expect(harness.sendTo).toHaveBeenCalledWith(winningHost, {
      type: 'sync.request',
      expectedSeq: 0,
    });
    await harness.receiveWire(winningHost, {
      type: 'sync.snapshot',
      snapshot: {
        replay: authority.exportSnapshot(),
        presence: {
          version: 1,
          seats: [[0, { peerId: winningHost, profileId: 'profile-b', bot: false }]],
        },
      },
    });
    expect(harness.resilience.seats.get(0)?.peerId).toBe(winningHost);
    expect(harness.pendingResync).toBe(false);
    expect(harness.pendingHostMigration).toBe(false);
    transport.close();
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

describe('same-room rematches', () => {
  it('accepts only the fresh deal derived from the completed shared table', async () => {
    const def = createBlitzDef();
    const config = blitzConfigSchema.defaults();
    const settings = { gameId: 'blitz', seats: 2, config };
    const authority = new EngineAuthority({
      def,
      session: createSession(def, { seed: 7, config, seats: 2 }),
      settings,
    });
    const previous = authority.exportSnapshot();
    const nextSeed = await rematchDealSeed('AB2Z', previous.seed, previous.stateHash);
    const nextAuthority = new EngineAuthority({
      def,
      session: createSession(def, { seed: nextSeed, config, seats: 2 }),
      settings,
    });
    const next = nextAuthority.exportSnapshot();
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
    };
    harness.startRoom('AB2Z', 'host');
    const observations: unknown[] = [];
    transport.onSnapshot((notification) => observations.push(notification));
    const presence = { version: 0, seats: [] };

    await expect(
      harness.receiveWire('host', {
        type: 'rematch.start',
        snapshot: { replay: { ...next, seed: (nextSeed + 1) >>> 0 }, presence },
      }),
    ).rejects.toThrow(/does not follow from the table/);
    expect(authority.exportSnapshot()).toEqual(previous);

    await harness.receiveWire('host', {
      type: 'rematch.start',
      snapshot: { replay: next, presence },
    });

    expect(authority.exportSnapshot()).toEqual(next);
    expect(observations).toEqual([{ kind: 'snapshot', reason: 'rematch', snapshot: next }]);
    transport.close();
  });
});

describe('only the current host may move the board', () => {
  function stubSignaling() {
    return new NostrSignaling({
      relays: [],
      pool: {
        ensureRelay: vi.fn(),
        publish: vi.fn(() => []),
        querySync: vi.fn(async () => []),
        subscribeMany: vi.fn(() => ({ close() {} })),
        close: vi.fn(),
      },
    });
  }

  function guestOnBlitz() {
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
    const transport = new P2PTransport({
      authority,
      profileId: 'guest-profile',
      signaling: stubSignaling(),
      origin: 'https://parlour.test',
    });
    const harness = transport as unknown as {
      resilience: MultiplayerState;
      startRoom(code: string, hostId: string): void;
      receiveWire(peerId: string, message: unknown): Promise<void>;
      sendTo: ReturnType<typeof vi.fn>;
    };
    harness.sendTo = vi.fn();
    harness.startRoom('AB2Z', 'host');

    const session = host.getSession();
    const move = def.flow.legalMoves(session.state, session.phase)[0]!;
    const packet = host.apply({
      id: 'action-1',
      seat: session.phase.actor!,
      move: move.id,
      payload: move.payload,
    });
    return { transport, harness, authority, packet };
  }

  /*
   * Switching to another app for a moment cost a player their seat, and could
   * cost the whole lobby: a frozen page stops heart-beating, so the table times
   * it out, and when it thaws its own clock has skipped the whole gap so it
   * times out the table right back. In a lobby that second half closes the room.
   */
  it('says it is backgrounding before the page freezes', () => {
    const { transport, harness } = guestOnBlitz();
    (transport as unknown as { links: Map<string, unknown> }).links.set('host', {
      pc: { close: vi.fn() },
    });

    transport.setPageHidden(true);

    expect(harness.sendTo).toHaveBeenCalledWith(
      'host',
      expect.objectContaining({ type: 'heartbeat', away: true }),
    );
    transport.close();
  });

  it('comes back from a frozen page without expiring the table it left', () => {
    const { transport, harness } = guestOnBlitz();
    harness.resilience.assignSeat(0, 'host', 'p-host');
    harness.resilience.seePeer('host', Date.now() - 120_000);
    const presence: { kind: string }[] = [];
    transport.onPresence((event) => presence.push(event));

    transport.setPageHidden(false);

    expect(presence.map(({ kind }) => kind)).not.toContain('room.closed');
    expect(harness.resilience.seats.has(0)).toBe(true);
    expect(harness.resilience.hostId).toBe('host');
    transport.close();
  });

  it('redials the host as soon as the page is visible again', () => {
    const { transport, harness } = guestOnBlitz();
    harness.resilience.assignSeat(0, 'host', 'p-host');
    harness.resilience.seePeer('host', Date.now());
    const connect = vi.fn().mockResolvedValue(undefined);
    (transport as unknown as { connect: typeof connect }).connect = connect;
    (transport as unknown as { links: Map<string, { pc: { close: () => void } }> }).links.set(
      'host',
      { pc: { close: vi.fn() } },
    );
    (transport as unknown as { redials: Map<string, number> }).redials.set('host', 3);

    transport.setPageHidden(false);

    expect(connect).toHaveBeenCalledWith('host', true);
    expect((transport as unknown as { redials: Map<string, number> }).redials.size).toBe(0);
    transport.close();
  });

  it('ignores an applied packet that did not come from the host', async () => {
    const { transport, harness, authority, packet } = guestOnBlitz();
    const before = authority.exportSnapshot();
    const events: unknown[] = [];
    transport.onEvent((event) => events.push(event));

    // A well-formed packet the host really did produce, relayed by somebody
    // else. Every other host-shaped message on this wire already checks the
    // sender; this one is the one that moves the game.
    await harness.receiveWire('some-other-peer', { type: 'applied', packet });

    expect(events).toEqual([]);
    expect(authority.exportSnapshot()).toEqual(before);
    expect(harness.sendTo).not.toHaveBeenCalled();
    transport.close();
  });

  it('still accepts the same packet from the host', async () => {
    const { transport, harness, authority, packet } = guestOnBlitz();
    const events: unknown[] = [];
    transport.onEvent((event) => events.push(event));

    await harness.receiveWire('host', { type: 'applied', packet });

    expect(events).toEqual([packet]);
    expect(authority.exportSnapshot().log).toHaveLength(packet.events.length);
    transport.close();
  });

  it('imports a host.changed snapshot after independently electing the same host', async () => {
    const { transport, harness, authority } = guestOnBlitz();
    const local = harness.resilience.localPeerId;
    const elected = '0'.repeat(64);
    const oldHost = 'host';

    harness.resilience.assignSeat(0, oldHost, 'p-host');
    harness.resilience.assignSeat(1, local, 'guest-profile');
    const now = Date.now();
    harness.resilience.seePeer(oldHost, now - HEARTBEAT_TIMEOUT_MS - 1);
    harness.resilience.seePeer(elected, now);
    harness.resilience.seePeer(local, now);

    expect(harness.resilience.expireAndElect(now).hostId).toBe(elected);
    expect(harness.resilience.seats.get(0)?.bot).toBe(false);

    await harness.receiveWire(elected, {
      type: 'host.changed',
      hostId: elected,
      term: 1,
      snapshot: {
        replay: authority.exportSnapshot(),
        presence: {
          version: 10,
          seats: [
            [0, { peerId: oldHost, profileId: 'p-host', bot: true }],
            [1, { peerId: local, profileId: 'guest-profile', bot: false }],
          ],
        },
      },
    });

    expect(harness.resilience.seats.get(0)?.bot).toBe(true);
    transport.close();
  });
});

/**
 * The deterministic-candidate rule says *who* may take over. On its own it says
 * nothing about *when*, and the peer it names satisfies it permanently — so the
 * smallest peer in a room could depose a host that was answering fine.
 */
describe('a host claim has to survive the host still being there', () => {
  /** peer-b is the smallest id in the room, so it is the standing candidate. */
  function guestUnder(host: string, seenAt = 1_000) {
    const guest = new MultiplayerState('peer-c', host);
    guest.seePeer(host, seenAt);
    guest.seePeer('peer-b', seenAt);
    return guest;
  }

  it('refuses a term bump while the current host is still being heard', () => {
    const guest = guestUnder('peer-m');
    expect(guest.considerHostClaim('peer-b', 1, false, 1_200)).toBe(false);
    expect(guest.hostId).toBe('peer-m');
    expect(guest.electionTerm).toBe(0);
  });

  it('accepts the same claim once the host has gone quiet', () => {
    const guest = guestUnder('peer-m');
    expect(guest.considerHostClaim('peer-b', 1, false, 1_000 + HEARTBEAT_TIMEOUT_MS + 1)).toBe(
      true,
    );
    expect(guest.hostId).toBe('peer-b');
    expect(guest.electionTerm).toBe(1);
  });

  it('refuses a peer trying to take the room from a host that is running it', () => {
    const host = new MultiplayerState('peer-m', 'peer-m');
    host.seePeer('peer-b', 1_000);
    // A host cannot have expired from its own point of view, whatever a peer
    // that would rather be in charge says about it.
    expect(host.considerHostClaim('peer-b', 1, false, 9_999)).toBe(false);
    expect(host.hostId).toBe('peer-m');
    expect(host.electionTerm).toBe(0);
  });

  it('leaves a same-term tiebreak alone — that is disagreement, not a seizure', () => {
    const guest = guestUnder('peer-z');
    expect(guest.considerHostClaim('peer-b', 0, false, 1_200)).toBe(true);
    expect(guest.hostId).toBe('peer-b');
  });

  it('still refuses a peer that is not the candidate at all', () => {
    const guest = new MultiplayerState('peer-c', 'peer-m');
    guest.seePeer('peer-m', 1_000);
    guest.seePeer('peer-b', 1_000);
    expect(guest.considerHostClaim('peer-z', 1, false, 99_999)).toBe(false);
  });
});

/*
 * Reported from two phones: a few seconds of silence between games left each
 * one hosting its own table against a bot, and each awarded itself the match.
 * Nobody had left. These are the pieces that let a stalled link come back.
 */
describe('a stalled link heals instead of splitting the table', () => {
  function guestHearingOnlyTheHost() {
    const guest = new MultiplayerState('peer-g', 'peer-h');
    guest.assignSeat(0, 'peer-h', 'profile-h');
    guest.assignSeat(1, 'peer-g', 'profile-g');
    guest.seePeer('peer-h', 0);
    return guest;
  }

  it('does not take the table while it can hear nobody at all', () => {
    const guest = guestHearingOnlyTheHost();
    const result = guest.expireAndElect(
      HEARTBEAT_TIMEOUT_MS + 1,
      HEARTBEAT_TIMEOUT_MS,
      false,
      ISOLATION_GRACE_MS,
    );
    expect(result).toMatchObject({ changed: false, hostId: 'peer-h', isolated: true });
    expect(guest.seats.get(0)?.bot).toBe(false);
  });

  it('still elects itself once the silence outlasts the grace', () => {
    const guest = guestHearingOnlyTheHost();
    const result = guest.expireAndElect(
      HEARTBEAT_TIMEOUT_MS + ISOLATION_GRACE_MS + 1,
      HEARTBEAT_TIMEOUT_MS,
      false,
      ISOLATION_GRACE_MS,
    );
    expect(result).toMatchObject({ changed: true, hostId: 'peer-g', term: 1, isolated: false });
    expect(guest.seats.get(0)?.bot).toBe(true);
  });

  it('elects on the ordinary timeout when another peer is still audible', () => {
    const guest = new MultiplayerState('peer-g', 'peer-h');
    guest.seePeer('peer-h', 0);
    guest.seePeer('peer-c', HEARTBEAT_TIMEOUT_MS);
    const result = guest.expireAndElect(
      HEARTBEAT_TIMEOUT_MS + 1,
      HEARTBEAT_TIMEOUT_MS,
      false,
      ISOLATION_GRACE_MS,
    );
    expect(result).toMatchObject({ changed: true, hostId: 'peer-c', isolated: false });
  });

  it('hands the table back to the exact host it replaced blind', () => {
    const guest = guestHearingOnlyTheHost();
    guest.expireAndElect(60_000, HEARTBEAT_TIMEOUT_MS, false, ISOLATION_GRACE_MS);
    expect(guest.hostId).toBe('peer-g');

    expect(guest.yieldToReturningHost('peer-x', 0)).toBe(false);
    expect(guest.yieldToReturningHost('peer-h', 1)).toBe(false);
    expect(guest.yieldToReturningHost('peer-h', 0)).toBe(true);
    expect(guest.hostId).toBe('peer-h');
    expect(guest.electionTerm).toBe(0);
    // Once, not every heartbeat after.
    expect(guest.yieldToReturningHost('peer-h', 0)).toBe(false);
  });

  it('never yields a table it was elected to by peers it could hear', () => {
    const guest = new MultiplayerState('peer-a', 'peer-h');
    guest.seePeer('peer-h', 0);
    guest.seePeer('peer-c', HEARTBEAT_TIMEOUT_MS);
    guest.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1);
    expect(guest.hostId).toBe('peer-a');
    expect(guest.yieldToReturningHost('peer-h', 0)).toBe(false);
  });

  it('gives a quiet player their seat back when they are heard again', () => {
    const host = new MultiplayerState('peer-h', 'peer-h');
    host.assignSeat(0, 'peer-h', 'profile-h');
    host.assignSeat(1, 'peer-g', 'profile-g');
    host.assignBotSeat(2);
    host.seePeer('peer-g', 0);
    host.expireAndElect(HEARTBEAT_TIMEOUT_MS + 1);
    expect(host.seats.get(1)?.bot).toBe(true);
    const before = host.exportPresence().version;

    expect(host.readmit('peer-g')).toEqual({ seat: 1, profileId: 'profile-g' });
    expect(host.seats.get(1)).toEqual({ peerId: 'peer-g', profileId: 'profile-g', bot: false });
    expect(host.exportPresence().version).toBe(before + 1);
    expect(host.readmit('peer-g')).toBeNull();
    expect(host.readmit('bot:2')).toBeNull();
  });
});

describe('the transport heals a stall on the channel it already has', () => {
  function stubPool() {
    const subscriptions: { close: ReturnType<typeof vi.fn> }[] = [];
    const pool = {
      ensureRelay: vi.fn(),
      publish: vi.fn(() => []),
      querySync: vi.fn(async () => []),
      subscribeMany: vi.fn(() => {
        const subscription = { close: vi.fn() };
        subscriptions.push(subscription);
        return subscription;
      }),
      close: vi.fn(),
    };
    return { pool, subscriptions };
  }

  type Harness = {
    resilience: MultiplayerState;
    links: Map<string, unknown>;
    startRoom(code: string, hostId: string): void;
    receiveWire(peerId: string, message: unknown): Promise<void>;
    receiveSignal(peerId: string, signal: unknown): Promise<void>;
    heartbeat(): void;
    sendTo: ReturnType<typeof vi.fn>;
  };

  function transportFor(hostId: 'self' | string, options: { peerConnection?: () => unknown } = {}) {
    let clock = 1_000;
    const { pool, subscriptions } = stubPool();
    const signaling = new NostrSignaling({ relays: [], pool });
    const transport = new P2PTransport({
      authority: counterAuthority(),
      profileId: 'profile-local',
      signaling,
      origin: 'https://parlour.test',
      now: () => clock,
      ...(options.peerConnection
        ? { peerConnection: options.peerConnection as () => RTCPeerConnection }
        : {}),
    });
    const harness = transport as unknown as Harness;
    harness.sendTo = vi.fn();
    harness.startRoom('AB2Z', hostId === 'self' ? signaling.publicKey : hostId);
    const presence: { kind: string; state?: string; seat?: number }[] = [];
    transport.onPresence((event) => presence.push(event as (typeof presence)[number]));
    return {
      transport,
      harness,
      signaling,
      presence,
      subscriptions,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it('gives the seat back when a player the host timed out speaks again', async () => {
    const { transport, harness, signaling, presence, advance } = transportFor('self');
    transport.holdLobby(false);
    harness.resilience.assignSeat(0, signaling.publicKey, 'profile-local');
    harness.resilience.assignSeat(1, 'peer-g', 'profile-g');
    harness.resilience.seePeer('peer-g', 1_000);

    advance(HEARTBEAT_TIMEOUT_MS + 1_001);
    harness.heartbeat();
    expect(harness.resilience.seats.get(1)?.bot).toBe(true);

    await harness.receiveWire('peer-g', { type: 'heartbeat', sentAt: 1 });

    expect(harness.resilience.seats.get(1)?.bot).toBe(false);
    expect(presence).toContainEqual(expect.objectContaining({ kind: 'seat.reclaimed', seat: 1 }));
    transport.close();
  });

  it('reports the host silent without deposing it, and live again when it speaks', async () => {
    const { transport, harness, signaling, presence, advance } = transportFor('peer-h');
    transport.holdLobby(false);
    harness.resilience.assignSeat(0, 'peer-h', 'profile-h');
    harness.resilience.assignSeat(1, signaling.publicKey, 'profile-local');
    harness.resilience.seePeer('peer-h', 1_000);

    advance(HEARTBEAT_TIMEOUT_MS + 1_001);
    harness.heartbeat();
    expect(harness.resilience.hostId).toBe('peer-h');
    expect(presence).toContainEqual({ kind: 'connection', state: 'reconnecting' });

    await harness.receiveWire('peer-h', {
      type: 'heartbeat',
      sentAt: 1,
      hostId: 'peer-h',
      term: 0,
    });
    expect(presence.at(-1)).toEqual({ kind: 'connection', state: 'connected' });
    transport.close();
  });

  it('steps down and asks for the table when the host it replaced was there all along', async () => {
    const { transport, harness, signaling, presence, advance } = transportFor('peer-h');
    transport.holdLobby(false);
    harness.resilience.assignSeat(0, 'peer-h', 'profile-h');
    harness.resilience.assignSeat(1, signaling.publicKey, 'profile-local');
    harness.resilience.seePeer('peer-h', 1_000);

    advance(HEARTBEAT_TIMEOUT_MS + ISOLATION_GRACE_MS + 1_001);
    harness.heartbeat();
    expect(harness.resilience.hostId).toBe(signaling.publicKey);

    await harness.receiveWire('peer-h', {
      type: 'heartbeat',
      sentAt: 1,
      hostId: 'peer-h',
      term: 0,
    });

    expect(harness.resilience.hostId).toBe('peer-h');
    expect(harness.sendTo).toHaveBeenCalledWith('peer-h', {
      type: 'sync.request',
      expectedSeq: 0,
    });
    expect(presence).toContainEqual({ kind: 'host.changed', hostId: 'peer-h' });
    transport.close();
  });

  it('answers a fresh offer on a new connection instead of renegotiating the dead one', async () => {
    const made: { closed: boolean; answered: boolean }[] = [];
    const peerConnection = () => {
      const record = { closed: false, answered: false };
      made.push(record);
      const pc = {
        remoteDescription: null as RTCSessionDescriptionInit | null,
        signalingState: 'stable' as RTCSignalingState,
        async setRemoteDescription(description: RTCSessionDescriptionInit) {
          pc.remoteDescription = description;
        },
        async createAnswer() {
          record.answered = true;
          return { type: 'answer', sdp: 'answer' };
        },
        async setLocalDescription() {},
        async addIceCandidate() {},
        close() {
          record.closed = true;
        },
      };
      return pc;
    };
    const { transport, harness, signaling } = transportFor('self', { peerConnection });
    vi.spyOn(signaling, 'send').mockResolvedValue();

    await harness.receiveSignal('peer-g', { type: 'offer', sdp: 'first' });
    await harness.receiveSignal('peer-g', { type: 'offer', sdp: 'second' });

    expect(made).toHaveLength(2);
    expect(made[0]).toEqual({ closed: true, answered: true });
    expect(made[1]).toEqual({ closed: false, answered: true });
    transport.close();
  });

  it('ignores an answer to an offer it has already abandoned', async () => {
    const setRemoteDescription = vi.fn();
    const peerConnection = () => ({
      remoteDescription: null,
      signalingState: 'stable',
      setRemoteDescription,
      async addIceCandidate() {},
      close() {},
    });
    const { transport, harness } = transportFor('self', { peerConnection });

    await harness.receiveSignal('peer-g', { type: 'ice', candidate: { candidate: 'x' } });
    await harness.receiveSignal('peer-g', { type: 'answer', sdp: 'late' });

    expect(setRemoteDescription).not.toHaveBeenCalled();
    transport.close();
  });

  it('still sends from its own chair while the host has it marked as a bot', () => {
    const { transport, harness, signaling } = transportFor('peer-h');
    harness.resilience.applyPresence(
      {
        version: 2,
        seats: [
          [0, { peerId: 'peer-h', profileId: 'profile-h', bot: false }],
          [1, { peerId: signaling.publicKey, profileId: 'profile-local', bot: true }],
        ],
      },
      2,
    );

    transport.send({ id: 'tap', seat: 1, move: 'increment' });

    expect(harness.sendTo).toHaveBeenCalledWith('peer-h', {
      type: 'intent',
      action: { id: 'tap', seat: 1, move: 'increment' },
    });
    transport.close();
  });

  it('leaves applied packets to the snapshot a stepped-down host is waiting for', async () => {
    const { transport, harness } = transportFor('peer-h');
    const host = counterAuthority();
    const packet = await host.apply({ id: 'moved', seat: 0, move: 'increment' });
    Object.assign(harness, { pendingResync: true, pendingHostMigration: true });
    const presence: { kind: string }[] = [];
    transport.onPresence((event) => presence.push(event));

    await harness.receiveWire('peer-h', { type: 'applied', packet });

    const local = (transport as unknown as { authority: ReturnType<typeof counterAuthority> })
      .authority;
    expect(local.exportSnapshot().log).toHaveLength(0);
    expect(presence.map(({ kind }) => kind)).not.toContain('error');
    expect(harness.sendTo).not.toHaveBeenCalled();
    transport.close();
  });

  it('renews the signalling subscription when the page comes back', () => {
    const { transport, subscriptions } = transportFor('peer-h');
    expect(subscriptions).toHaveLength(1);

    transport.setPageHidden(false);

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0]!.close).toHaveBeenCalled();
    expect(subscriptions[1]!.close).not.toHaveBeenCalled();
    transport.close();
  });
});
