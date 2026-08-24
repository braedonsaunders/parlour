import { createSession, replaySession, sessionApply, sessionInject } from './runtime';
import {
  createFx,
  rngSeedFrom,
  type AppliedEvent,
  type ApplyMeta,
  type FxEmitter,
  type FxEvent,
  type GameDef,
  type GameSession,
  type MatchResult,
  type RuleError,
  type RuleValues,
  type SeatId,
} from './types';

// ---------------------------------------------------------------------------
// Match composition (spec follow-on to §5.3): a MatchDef folds a sequence of
// deterministic round sessions into cross-round state — lives, cumulative
// scores, dealer rotation. Rounds stay pure GameDef sessions; the match layer
// owns nothing but the fold, so replay/rematch is: replay every round log.
// ---------------------------------------------------------------------------

export interface MatchFoldCtx<S> {
  /** 0-based index of the round being folded */
  roundIndex: number;
  /** the round's final state, for details the MatchResult doesn't carry */
  finalState: S;
  /** presentation hints for the fold (chip losses, score flips) */
  fx: FxEmitter;
}

export interface MatchDef<S, C extends RuleValues, MS> {
  id: string;
  game: GameDef<S, C>;
  /** cross-round state before the first deal */
  init(ctx: { config: C; seats: number }): MS;
  /** folds a finished round's result into match state; pure aside from fx */
  fold(match: MS, result: MatchResult, ctx: MatchFoldCtx<S>): MS;
  /** non-null ends the match; consulted after every fold */
  matchEnd(match: MS, ctx: { roundIndex: number; seats: number }): MatchResult | null;
  /** per-round config adjustments (dealer rotation, escalating stakes) */
  roundConfig?(match: MS, roundIndex: number, base: C): C;
}

export interface MatchSession<S, C extends RuleValues, MS> {
  def: MatchDef<S, C, MS>;
  seed: number;
  config: C;
  seats: number;
  match: MS;
  /** 0-based index of the current (or just-finished) round */
  roundIndex: number;
  round: GameSession<S, C>;
  /** completed rounds' logs, in order — replayMatch consumes exactly this */
  roundLogs: readonly (readonly AppliedEvent[])[];
  /** completed rounds' results, in order */
  history: readonly MatchResult[];
  status: 'playing' | 'round-over' | 'ended';
  result: MatchResult | null;
}

export interface MatchOutcome<S, C extends RuleValues, MS> {
  session: MatchSession<S, C, MS>;
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected?: RuleError;
  /** set when a round finished within this call */
  roundResult?: MatchResult;
}

/** Round seeds derive from the match seed alone, so any peer can replay any round. */
export function roundSeed(matchSeed: number, roundIndex: number): number {
  return rngSeedFrom(`match:${matchSeed | 0}:round:${roundIndex}`) | 0;
}

function roundConfigFor<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  match: MS,
  roundIndex: number,
  base: C,
): C {
  const adjusted = def.roundConfig ? def.roundConfig(match, roundIndex, base) : base;
  return def.game.configSchema.resolve(adjusted);
}

/** Folds a round that just ended; mutates nothing — returns the next session value. */
function foldRound<S, C extends RuleValues, MS>(
  session: MatchSession<S, C, MS>,
  round: GameSession<S, C>,
  fx: FxEmitter,
): { session: MatchSession<S, C, MS>; roundResult: MatchResult } {
  const roundResult = round.result;
  if (!roundResult) throw new Error('foldRound: the round session has no result');
  const { def } = session;
  const match = def.fold(session.match, roundResult, {
    roundIndex: session.roundIndex,
    finalState: round.state,
    fx,
  });
  const ended = def.matchEnd(match, { roundIndex: session.roundIndex, seats: session.seats });
  return {
    roundResult,
    session: {
      ...session,
      match,
      round,
      roundLogs: [...session.roundLogs, round.log],
      history: [...session.history, roundResult],
      status: ended ? 'ended' : 'round-over',
      result: ended,
    },
  };
}

function openRound<S, C extends RuleValues, MS>(
  session: MatchSession<S, C, MS>,
  roundIndex: number,
): MatchOutcome<S, C, MS> {
  const { def } = session;
  const config = roundConfigFor(def, session.match, roundIndex, session.config);
  const round = createSession(def.game, {
    seed: roundSeed(session.seed, roundIndex),
    config,
    seats: session.seats,
  });
  const opened: MatchSession<S, C, MS> = { ...session, roundIndex, round, status: 'playing' };
  const fx = createFx();
  for (const event of round.setupFx ?? []) fx.events.push(event);

  // a round can be over on the deal (e.g. a dealt blitz) — fold it immediately
  if (round.status === 'ended') {
    const folded = foldRound(opened, round, fx);
    return {
      session: folded.session,
      events: [],
      fx: fx.events,
      roundResult: folded.roundResult,
    };
  }
  return { session: opened, events: [], fx: fx.events };
}

export function createMatch<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  opts: { seed: number; config: C; seats: number },
): MatchOutcome<S, C, MS> {
  const config = def.game.configSchema.resolve(opts.config);
  const match = def.init({ config, seats: opts.seats });
  const base: MatchSession<S, C, MS> = {
    def,
    seed: opts.seed,
    config,
    seats: opts.seats,
    match,
    roundIndex: 0,
    // placeholder; openRound replaces it before anyone can observe it
    round: null as unknown as GameSession<S, C>,
    roundLogs: [],
    history: [],
    status: 'playing',
    result: null,
  };
  return openRound(base, 0);
}

export function matchApply<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  session: MatchSession<S, C, MS>,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): MatchOutcome<S, C, MS> {
  if (session.status === 'ended') {
    return rejectMatch(session, 'match-ended', 'the match has already ended');
  }
  if (session.status === 'round-over') {
    return rejectMatch(session, 'round-over', 'the round is over — start the next round');
  }
  const outcome = sessionApply(def.game, session.round, seat, moveId, payload);
  if (outcome.rejected) {
    return rejectMatch(session, outcome.rejected.code, outcome.rejected.message);
  }
  const round = outcome.session;
  if (round.status !== 'ended') {
    return {
      session: { ...session, round },
      events: outcome.events,
      fx: outcome.fx,
    };
  }
  const fx = createFx();
  for (const event of outcome.fx) fx.events.push(event);
  const folded = foldRound(session, round, fx);
  return {
    session: folded.session,
    events: outcome.events,
    fx: fx.events,
    roundResult: folded.roundResult,
  };
}

/**
 * Injects an authority-owned system fact into the active round (for example a
 * match-clock expiry). The event remains in that round's ordinary log, so
 * match replay preserves its exact position relative to player actions.
 */
export function matchInject<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  session: MatchSession<S, C, MS>,
  moveId: string,
  payload?: unknown,
  meta: ApplyMeta = {},
): MatchOutcome<S, C, MS> {
  if (session.status === 'ended') {
    return rejectMatch(session, 'match-ended', 'the match has already ended');
  }
  if (session.status === 'round-over') {
    return rejectMatch(session, 'round-over', 'the round is over — start the next round');
  }
  const outcome = sessionInject(def.game, session.round, moveId, payload, meta);
  if (outcome.rejected) {
    return rejectMatch(session, outcome.rejected.code, outcome.rejected.message);
  }
  const round = outcome.session;
  if (round.status !== 'ended') {
    return {
      session: { ...session, round },
      events: outcome.events,
      fx: outcome.fx,
    };
  }
  const fx = createFx();
  for (const event of outcome.fx) fx.events.push(event);
  const folded = foldRound(session, round, fx);
  return {
    session: folded.session,
    events: outcome.events,
    fx: fx.events,
    roundResult: folded.roundResult,
  };
}

export function matchNextRound<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  session: MatchSession<S, C, MS>,
): MatchOutcome<S, C, MS> {
  if (def !== session.def) throw new Error('matchNextRound: def does not match the session');
  if (session.status === 'ended') {
    return rejectMatch(session, 'match-ended', 'the match has already ended');
  }
  if (session.status !== 'round-over') {
    return rejectMatch(session, 'round-playing', 'the current round is not over');
  }
  return openRound(session, session.roundIndex + 1);
}

/**
 * Rebuilds a match from its round logs — the rematch/reconnect story: a peer
 * holding (seed, config, seats, roundLogs) reproduces the exact match state.
 *
 * Slot semantics: `roundLogs[i]` is round i's full log. Serialize a live match
 * as `[...session.roundLogs, session.round.log]` while a round is playing, or
 * plain `session.roundLogs` at round-over/ended. Rounds that ended on the deal
 * fold automatically and occupy an EMPTY slot. Replay lands on the exact live
 * status: it never auto-advances past a `round-over` the live session sat in.
 */
export function replayMatch<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  seed: number,
  roundLogs: readonly (readonly AppliedEvent[])[],
  opts: { config: C; seats: number },
): MatchSession<S, C, MS> {
  let session = createMatch(def, { seed, config: opts.config, seats: opts.seats }).session;
  for (let i = 0; i < roundLogs.length; i++) {
    const log = roundLogs[i] ?? [];
    if (session.status === 'ended') break;
    if (session.status === 'round-over') {
      if (session.roundIndex >= i) {
        // slot i was consumed when this round auto-folded on the deal
        if (log.length > 0) {
          throw new Error(`replayMatch: round ${i} ended on the deal but its log is non-empty`);
        }
        continue;
      }
      session = matchNextRound(def, session).session;
      if (session.status !== 'playing') {
        // the freshly opened round auto-folded too (or ended the match)
        if (log.length > 0) {
          throw new Error(`replayMatch: round ${i} ended on the deal but its log is non-empty`);
        }
        continue;
      }
    }
    if (session.roundIndex !== i) {
      throw new Error(
        `replayMatch: expected round ${i}, but the match is at ${session.roundIndex}`,
      );
    }
    if (log.length === 0) continue;
    const config = roundConfigFor(def, session.match, i, session.config);
    const round = replaySession(def.game, roundSeed(seed, i), log, {
      config,
      seats: session.seats,
    });
    if (round.status === 'ended') {
      session = foldRound(session, round, createFx()).session;
    } else {
      session = { ...session, round };
    }
  }
  return session;
}

function rejectMatch<S, C extends RuleValues, MS>(
  session: MatchSession<S, C, MS>,
  code: string,
  message: string,
): MatchOutcome<S, C, MS> {
  return { session, events: [], fx: [], rejected: { code, message } };
}
