import { describe, expect, it } from 'vitest';
import { defineConfig } from './config';
import { createSession, replaySession, sessionApply, sessionInject, stateHash } from './runtime';
import {
  actingSeats,
  isActingSeat,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type Move,
  type SeatId,
} from './types';

// --- slap fixture: every seat may act at once; first logged slap wins -------

interface SlapRules {
  [key: string]: ConfigFieldValue;
}

interface SlapState {
  seats: number;
  winner: SeatId | null;
}

const slapConfig = defineConfig<SlapRules>([]);

const slap: Move<SlapState> = {
  validate(state) {
    return state.winner === null
      ? true
      : { code: 'already-slapped', message: 'someone already won the slap' };
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('slap.win', { seat });
    return { ...state, winner: seat };
  },
};

const slapFlow: Flow<SlapState> = {
  start(state) {
    return {
      phase: 'slap',
      actor: null,
      actors: Array.from({ length: state.seats }, (_, seat) => seat),
      round: 1,
    };
  },
  legalMoves() {
    return [{ id: 'slap' }];
  },
  legalMovesFor(state, _phase, seat) {
    if (state.winner !== null) return [];
    // seat 1 sits this hand out — proves per-seat enumeration gates apply
    return seat === 1 ? [] : [{ id: 'slap' }];
  },
  advance(state) {
    if (state.winner === null) {
      return {
        phase: {
          phase: 'slap',
          actor: null,
          actors: Array.from({ length: state.seats }, (_, seat) => seat),
          round: 1,
        },
      };
    }
    return {
      phase: { phase: 'ended', actor: null, round: 1 },
      ended: {
        winner: state.winner,
        rankings: [{ seat: state.winner, rank: 1 }],
        reason: 'fastest-slap',
      },
    };
  },
};

const slapGame: GameDef<SlapState, SlapRules> = {
  id: 'slap-test',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema: slapConfig,
  setup: ({ seats }) => ({ seats, winner: null }),
  moves: { slap },
  flow: slapFlow,
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

// --- clock fixture: wall-clock enters ONLY via injected tick events ---------

interface ClockRules {
  limitMs: number;
  [key: string]: ConfigFieldValue;
}

interface ClockState {
  seats: number;
  turn: SeatId;
  plays: number;
  nowMs: number;
  limitMs: number;
}

const clockConfig = defineConfig<ClockRules>([
  { key: 'limitMs', kind: 'int', label: 'Time limit', min: 100, max: 60_000, default: 1000 },
]);

const play: Move<ClockState> = {
  validate: () => true,
  apply(state, seat) {
    return { ...state, plays: state.plays + 1, turn: (seat + 1) % state.seats };
  },
};

const tick: Move<ClockState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const now = ctx.event.atMs;
    if (now === undefined) return state;
    return { ...state, nowMs: Math.max(state.nowMs, now) };
  },
};

const clockFlow: Flow<ClockState> = {
  start: (state) => ({ phase: 'play', actor: state.turn, round: 1 }),
  legalMoves: () => [{ id: 'play' }],
  advance(state) {
    if (state.nowMs >= state.limitMs) {
      return {
        phase: { phase: 'ended', actor: null, round: 1 },
        ended: {
          winner: null,
          rankings: [],
          reason: 'time-expired',
        },
      };
    }
    return { phase: { phase: 'play', actor: state.turn, round: 1 } };
  },
  canInject(_state, _phase, moveId, _payload, meta) {
    if (moveId !== 'tick') {
      return { code: 'bad-injection', message: `${moveId} cannot be injected` };
    }
    return meta.atMs !== undefined
      ? true
      : { code: 'bad-clock', message: 'tick requires authoritative atMs metadata' };
  },
};

const clockGame: GameDef<ClockState, ClockRules> = {
  id: 'clock-test',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema: clockConfig,
  setup: ({ config, seats }) => ({
    seats,
    turn: 0,
    plays: 0,
    nowMs: 0,
    limitMs: config.limitMs,
  }),
  moves: { play, tick },
  flow: clockFlow,
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

// --- tests -------------------------------------------------------------------

describe('acting seats helpers', () => {
  it('actors supersedes actor when present', () => {
    expect(actingSeats({ phase: 'x', actor: 3, actors: [0, 2], round: 1 })).toEqual([0, 2]);
    expect(actingSeats({ phase: 'x', actor: 3, round: 1 })).toEqual([3]);
    expect(actingSeats({ phase: 'x', actor: null, round: 1 })).toEqual([]);
    expect(isActingSeat({ phase: 'x', actor: null, actors: [1], round: 1 }, 1)).toBe(true);
    expect(isActingSeat({ phase: 'x', actor: null, actors: [1], round: 1 }, 0)).toBe(false);
  });
});

describe('simultaneous phases', () => {
  const OPTS = { seed: 7, config: slapConfig.defaults(), seats: 3 };

  it('lets any listed seat act, not just phase.actor', () => {
    const session = createSession(slapGame, OPTS);
    expect(session.phase.actor).toBeNull();
    const outcome = sessionApply(slapGame, session, 2, 'slap');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result?.winner).toBe(2);
  });

  it('the first logged slap wins; later slaps hit match-ended', () => {
    const session = createSession(slapGame, OPTS);
    const first = sessionApply(slapGame, session, 0, 'slap');
    const second = sessionApply(slapGame, first.session, 2, 'slap');
    expect(first.session.result?.winner).toBe(0);
    expect(second.rejected?.code).toBe('match-ended');
  });

  it('gates each seat by its own legal move list', () => {
    const session = createSession(slapGame, OPTS);
    // seat 1 is acting but legalMovesFor gives it nothing
    const outcome = sessionApply(slapGame, session, 1, 'slap');
    expect(outcome.rejected?.code).toBe('illegal-move');
  });

  it('rejects seats outside phase.actors', () => {
    const session = createSession(slapGame, { ...OPTS, seats: 2 });
    const outcome = sessionApply(slapGame, session, 5, 'slap');
    expect(outcome.rejected?.code).toBe('not-your-turn');
  });

  it('replays a simultaneous game identically', () => {
    const session = createSession(slapGame, OPTS);
    const live = sessionApply(slapGame, session, 2, 'slap').session;
    const replayed = replaySession(slapGame, OPTS.seed, live.log, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.result).toEqual(live.result);
    expect(stateHash(replayed.state)).toBe(stateHash(live.state));
  });
});

describe('sessionInject', () => {
  const OPTS = { seed: 11, config: clockConfig.defaults(), seats: 2 };

  it('refuses games that do not opt in via canInject', () => {
    const session = createSession(slapGame, { seed: 1, config: slapConfig.defaults(), seats: 2 });
    const outcome = sessionInject(slapGame, session, 'slap', {});
    expect(outcome.rejected?.code).toBe('injection-unsupported');
    expect(outcome.session).toBe(session);
  });

  it('refuses moves and payloads the flow rejects', () => {
    const session = createSession(clockGame, OPTS);
    expect(sessionInject(clockGame, session, 'play').rejected?.code).toBe('bad-injection');
    expect(sessionInject(clockGame, session, 'tick').rejected?.code).toBe('bad-clock');
    expect(sessionInject(clockGame, session, 'missing').rejected?.code).toBe('unknown-move');
  });

  it('applies an accepted tick as a seat-null injected log event', () => {
    const session = createSession(clockGame, OPTS);
    const outcome = sessionInject(clockGame, session, 'tick', undefined, { atMs: 400 });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]).toMatchObject({
      seat: null,
      move: 'tick',
      injected: true,
      atMs: 400,
    });
    expect(outcome.session.state.nowMs).toBe(400);
    expect(outcome.session.status).toBe('playing');
  });

  it('ends the match when the injected clock crosses the limit', () => {
    const session = createSession(clockGame, OPTS);
    const outcome = sessionInject(clockGame, session, 'tick', undefined, { atMs: 1500 });
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result?.reason).toBe('time-expired');
  });

  it('replays injected timestamps deterministically from the log', () => {
    let session = createSession(clockGame, OPTS);
    session = sessionApply(clockGame, session, 0, 'play', undefined, { atMs: 100 }).session;
    session = sessionInject(clockGame, session, 'tick', undefined, { atMs: 700 }).session;
    session = sessionApply(clockGame, session, 1, 'play', undefined, { atMs: 900 }).session;
    session = sessionInject(clockGame, session, 'tick', undefined, { atMs: 1200 }).session;
    expect(session.status).toBe('ended');

    const replayed = replaySession(clockGame, OPTS.seed, session.log, {
      config: session.config,
      seats: session.seats,
    });
    expect(replayed.state.nowMs).toBe(1200);
    expect(replayed.status).toBe('ended');
    expect(replayed.log.filter((e) => e.injected)).toHaveLength(2);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
  });

  it('rejects invalid or regressing authoritative event times', () => {
    let session = createSession(clockGame, OPTS);
    expect(
      sessionInject(clockGame, session, 'tick', undefined, { atMs: Number.NaN }).rejected?.code,
    ).toBe('invalid-event-time');
    session = sessionInject(clockGame, session, 'tick', undefined, { atMs: 700 }).session;
    expect(
      sessionApply(clockGame, session, 0, 'play', undefined, { atMs: 699 }).rejected?.code,
    ).toBe('event-time-regressed');
  });
});
