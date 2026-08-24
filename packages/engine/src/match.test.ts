import { describe, expect, it } from 'vitest';
import { defineConfig } from './config';
import {
  createMatch,
  matchApply,
  matchNextRound,
  replayMatch,
  roundSeed,
  type MatchDef,
  type MatchOutcome,
  type MatchSession,
} from './match';
import { stateHash } from './runtime';
import type { ConfigFieldValue, Flow, GameDef, Move, SeatId } from './types';

// --- roll fixture: each seat rolls once; highest roll takes the round --------

interface RollRules {
  instant: boolean;
  [key: string]: ConfigFieldValue;
}

interface RollState {
  seats: number;
  turn: SeatId;
  rolls: (number | null)[];
}

const rollConfig = defineConfig<RollRules>([
  { key: 'instant', kind: 'toggle', label: 'Resolve on the deal', default: false },
]);

const roll: Move<RollState> = {
  validate: (state, seat) =>
    state.rolls[seat] === null ? true : { code: 'rolled', message: 'seat already rolled' },
  apply(state, seat, _payload, ctx) {
    const value = ctx.rng.int(1000);
    ctx.fx.emit('roll', { seat, value });
    return {
      ...state,
      rolls: state.rolls.map((r, i) => (i === seat ? value : r)),
      turn: (seat + 1) % state.seats,
    };
  },
};

function rollResult(state: RollState) {
  if (state.rolls.some((r) => r === null)) return null;
  const ranked = state.rolls
    .map((value, seat) => ({ seat, value: value as number }))
    .sort((a, b) => b.value - a.value || a.seat - b.seat);
  return {
    winner: ranked[0]!.seat,
    rankings: ranked.map((entry, index) => ({
      seat: entry.seat,
      rank: index + 1,
      detail: { roll: entry.value },
    })),
    reason: 'highest-roll',
  };
}

const rollFlow: Flow<RollState> = {
  start: (state) => ({ phase: 'roll', actor: state.turn, round: 1 }),
  legalMoves: () => [{ id: 'roll' }],
  advance(state) {
    const ended = rollResult(state);
    if (ended) return { phase: { phase: 'ended', actor: null, round: 1 }, ended };
    return { phase: { phase: 'roll', actor: state.turn, round: 1 } };
  },
};

const rollGame: GameDef<RollState, RollRules> = {
  id: 'roll-test',
  configSchema: rollConfig,
  setup({ config, seats, rng }) {
    const rolls = Array.from({ length: seats }, () => (config.instant ? rng.int(1000) : null));
    return { seats, turn: 0, rolls };
  },
  moves: { roll },
  flow: rollFlow,
  playerView: (state) => state,
  end: rollResult,
  bots: [],
};

// --- match def: first seat to 2 round wins takes the match -------------------

interface RollMatchState {
  wins: number[];
}

const TARGET = 2;

const rollMatch: MatchDef<RollState, RollRules, RollMatchState> = {
  id: 'roll-first-to-2',
  game: rollGame,
  init: ({ seats }) => ({ wins: Array.from({ length: seats }, () => 0) }),
  fold(match, result, ctx) {
    if (result.winner === null) return match;
    ctx.fx.emit('match.point', { seat: result.winner, wins: match.wins[result.winner]! + 1 });
    return {
      wins: match.wins.map((w, seat) => (seat === result.winner ? w + 1 : w)),
    };
  },
  matchEnd(match) {
    const winner = match.wins.findIndex((w) => w >= TARGET);
    if (winner < 0) return null;
    const ranked = match.wins
      .map((wins, seat) => ({ seat, wins }))
      .sort((a, b) => b.wins - a.wins || a.seat - b.seat);
    return {
      winner,
      rankings: ranked.map((entry, index) => ({
        seat: entry.seat,
        rank: index + 1,
        detail: { roundWins: entry.wins },
      })),
      reason: `first to ${TARGET}`,
    };
  },
};

/** Variant: round 0 is played out, every later round resolves on the deal. */
const rollMatchLightning: MatchDef<RollState, RollRules, RollMatchState> = {
  ...rollMatch,
  id: 'roll-lightning',
  roundConfig: (_match, roundIndex, base) => ({ ...base, instant: roundIndex > 0 }),
};

const OPTS = { seed: 4242, config: rollConfig.defaults(), seats: 3 };

type DriveResult = {
  session: MatchSession<RollState, RollRules, RollMatchState>;
  foldFxKinds: string[][];
};

/** Plays the match to completion: every actor rolls; round-over advances. */
function driveMatch(seed = OPTS.seed): DriveResult {
  let outcome: MatchOutcome<RollState, RollRules, RollMatchState> = createMatch(rollMatch, {
    ...OPTS,
    seed,
  });
  const foldFxKinds: string[][] = [];
  let guard = 0;
  while (outcome.session.status !== 'ended') {
    if (guard++ > 200) throw new Error('driveMatch did not finish');
    if (outcome.session.status === 'round-over') {
      outcome = matchNextRound(rollMatch, outcome.session);
      continue;
    }
    const actor = outcome.session.round.phase.actor;
    if (actor === null) throw new Error('no actor while playing');
    outcome = matchApply(rollMatch, outcome.session, actor, 'roll');
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    if (outcome.roundResult) foldFxKinds.push(outcome.fx.map((e) => e.kind));
  }
  return { session: outcome.session, foldFxKinds };
}

describe('createMatch', () => {
  it('opens round 0 as a live session', () => {
    const outcome = createMatch(rollMatch, OPTS);
    expect(outcome.session.status).toBe('playing');
    expect(outcome.session.roundIndex).toBe(0);
    expect(outcome.session.round.seed).toBe(roundSeed(OPTS.seed, 0));
    expect(outcome.session.match.wins).toEqual([0, 0, 0]);
  });

  it('auto-folds a round that ends on the deal', () => {
    const outcome = createMatch(rollMatch, {
      ...OPTS,
      config: { instant: true },
    });
    expect(outcome.session.status).toBe('round-over');
    expect(outcome.roundResult?.reason).toBe('highest-roll');
    expect(outcome.session.roundLogs).toEqual([[]]);
    expect(outcome.session.match.wins.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('matchApply / matchNextRound', () => {
  it('plays a full match to a winner and folds every round', () => {
    const { session, foldFxKinds } = driveMatch();
    expect(session.status).toBe('ended');
    expect(session.result?.winner).toBe(session.match.wins.findIndex((w) => w >= TARGET));
    expect(session.history.length).toBeGreaterThanOrEqual(TARGET);
    expect(session.roundLogs).toHaveLength(session.history.length);
    // every round-ending apply carried the fold's fx alongside the round's own
    for (const kinds of foldFxKinds) expect(kinds).toContain('match.point');
  });

  it('is deterministic for a given seed', () => {
    const a = driveMatch();
    const b = driveMatch();
    expect(a.session.match).toEqual(b.session.match);
    expect(a.session.result).toEqual(b.session.result);
    expect(a.session.history).toEqual(b.session.history);
  });

  it('rejects applies at round-over and next-round while playing', () => {
    let outcome = createMatch(rollMatch, OPTS);
    expect(matchNextRound(rollMatch, outcome.session).rejected?.code).toBe('round-playing');
    // finish round 0
    let guard = 0;
    while (outcome.session.status === 'playing') {
      if (guard++ > 10) throw new Error('round 0 never ended');
      const actor = outcome.session.round.phase.actor!;
      outcome = matchApply(rollMatch, outcome.session, actor, 'roll');
    }
    expect(outcome.session.status).toBe('round-over');
    expect(matchApply(rollMatch, outcome.session, 0, 'roll').rejected?.code).toBe('round-over');

    const next = matchNextRound(rollMatch, outcome.session);
    expect(next.session.status).toBe('playing');
    expect(next.session.roundIndex).toBe(1);
    expect(next.fx.length).toBeGreaterThanOrEqual(0);
  });

  it('applies roundConfig per round', () => {
    let outcome = createMatch(rollMatchLightning, OPTS);
    expect(outcome.session.round.config.instant).toBe(false);
    let guard = 0;
    while (outcome.session.status === 'playing') {
      if (guard++ > 10) throw new Error('round 0 never ended');
      outcome = matchApply(
        rollMatchLightning,
        outcome.session,
        outcome.session.round.phase.actor!,
        'roll',
      );
    }
    // round 1 resolves on the deal thanks to roundConfig
    outcome = matchNextRound(rollMatchLightning, outcome.session);
    expect(outcome.session.roundIndex).toBe(1);
    expect(outcome.session.round.config.instant).toBe(true);
    expect(outcome.session.status === 'round-over' || outcome.session.status === 'ended').toBe(
      true,
    );
    expect(outcome.roundResult).toBeDefined();
  });

  it('refuses everything after the match ends', () => {
    const { session } = driveMatch();
    expect(matchApply(rollMatch, session, 0, 'roll').rejected?.code).toBe('match-ended');
    expect(matchNextRound(rollMatch, session).rejected?.code).toBe('match-ended');
  });
});

describe('replayMatch', () => {
  it('reproduces a finished match from its round logs', () => {
    const { session: live } = driveMatch();
    const replayed = replayMatch(rollMatch, OPTS.seed, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.match).toEqual(live.match);
    expect(replayed.result).toEqual(live.result);
    expect(replayed.history).toEqual(live.history);
  });

  it('lands mid-round exactly where the live match sat', () => {
    // play round 0 to completion, then one roll into round 1
    let outcome = createMatch(rollMatch, OPTS);
    let guard = 0;
    while (outcome.session.status === 'playing') {
      if (guard++ > 10) throw new Error('round 0 never ended');
      outcome = matchApply(rollMatch, outcome.session, outcome.session.round.phase.actor!, 'roll');
    }
    outcome = matchNextRound(rollMatch, outcome.session);
    outcome = matchApply(rollMatch, outcome.session, outcome.session.round.phase.actor!, 'roll');
    const live = outcome.session;
    expect(live.status).toBe('playing');
    expect(live.roundIndex).toBe(1);

    const replayed = replayMatch(rollMatch, OPTS.seed, [...live.roundLogs, live.round.log], {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('playing');
    expect(replayed.roundIndex).toBe(1);
    expect(replayed.match).toEqual(live.match);
    expect(stateHash(replayed.round.state)).toBe(stateHash(live.round.state));
  });

  it('stays at round-over instead of auto-advancing past it', () => {
    let outcome = createMatch(rollMatch, OPTS);
    let guard = 0;
    while (outcome.session.status === 'playing') {
      if (guard++ > 10) throw new Error('round 0 never ended');
      outcome = matchApply(rollMatch, outcome.session, outcome.session.round.phase.actor!, 'roll');
    }
    const live = outcome.session;
    expect(live.status).toBe('round-over');

    const replayed = replayMatch(rollMatch, OPTS.seed, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('round-over');
    expect(replayed.roundIndex).toBe(0);
    expect(replayed.match).toEqual(live.match);
  });

  it('replays deal-ended rounds through their empty log slots', () => {
    // instant rounds fold on the deal until someone reaches the target
    let outcome = createMatch(rollMatch, { ...OPTS, config: { instant: true } });
    let guard = 0;
    while (outcome.session.status === 'round-over') {
      if (guard++ > 20) throw new Error('instant match never ended');
      outcome = matchNextRound(rollMatch, outcome.session);
    }
    const live = outcome.session;
    expect(live.status).toBe('ended');
    expect(live.roundLogs.every((log) => log.length === 0)).toBe(true);

    const replayed = replayMatch(rollMatch, OPTS.seed, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.match).toEqual(live.match);
    expect(replayed.result).toEqual(live.result);
  });
});
