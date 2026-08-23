import {
  createSession,
  defineConfig,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type Move,
} from '@parlour/engine';
import { describe, expect, it, vi } from 'vitest';
import {
  EMOTES,
  EngineAuthority,
  HEARTBEAT_TIMEOUT_MS,
  MultiplayerState,
  normalizeRoomCode,
  roomJoinUrl,
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
  it('normalizes an unambiguous four-character code and rejects unsafe input', () => {
    expect(normalizeRoomCode(' ab2z ')).toBe('AB2Z');
    expect(normalizeRoomCode('OI10')).toBeNull();
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(roomJoinUrl('https://parlour.app/', 'ab2z')).toBe('https://parlour.app/join/AB2Z');
  });
});

describe('resilience state', () => {
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
