import { createSession, replaySession, sessionApply, sessionInject } from './runtime';
import {
  createFx,
  rngSeedFrom,
  type AppliedEvent,
  type ApplyMeta,
  type CardId,
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
  /** true when every round of this match is dealt under Veil */
  veiled?: boolean;
  /**
   * Ceremony deck order per round index, `deckOrders[i]` belonging to round i.
   * A veiled match cannot open a round it has no order for, because a fresh
   * shuffle ceremony has to run between deals — see {@link matchNextRound}.
   */
  deckOrders: readonly (readonly CardId[] | undefined)[];
}

/** How a round is opened: veiled matches must supply that round's deck order. */
export interface RoundDeal {
  /** ceremony deck order for the round about to be dealt */
  deckOrder?: readonly CardId[];
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

/** Records a round's ceremony order without disturbing the slots around it. */
function withDeckOrder(
  orders: readonly (readonly CardId[] | undefined)[],
  roundIndex: number,
  deckOrder: readonly CardId[],
): readonly (readonly CardId[] | undefined)[] {
  const next = orders.slice();
  while (next.length <= roundIndex) next.push(undefined);
  next[roundIndex] = [...deckOrder];
  return next;
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

/**
 * Opens round `roundIndex` as a fresh, ordinary `GameSession`.
 *
 * ## A match cannot be veiled, and that is structural
 *
 * This deliberately passes no `veiled`/`deckOrder`. A veiled round needs a deck
 * order produced by a shuffle ceremony that runs in the *transport* (see
 * apps/web/src/lib/multiplayer/veil), and the match layer is pure engine code
 * with no way to pause, run a multi-party protocol, and resume. Because
 * `createSession` throws when `veiled` is set without an order, a `MatchDef` is
 * structurally incapable of running under Veil — silently, because nothing here
 * ever asks for one.
 *
 * The consequence is worth naming, because reading the engine's Veil support
 * alone leads to the opposite conclusion: **Veil covers single-deal games
 * only.** Wild, Rat Screw and a one-round Blitz can be veiled. Gin, Cribbage,
 * Hearts and Spades cannot, because their friend rooms are match-shaped. The
 * room layer refuses those combinations by name rather than downgrading them
 * quietly — see `veilRefusal` in apps/web/src/lib/rooms/gameRegistry.ts.
 *
 * Lifting the ceiling means giving `MatchDef` a way to request a deck order for
 * round N and suspend until the transport supplies one: an async seam this
 * layer does not have, and should not grow casually, because every round would
 * then be able to block on the network.
 */
function openRound<S, C extends RuleValues, MS>(
  session: MatchSession<S, C, MS>,
  roundIndex: number,
  deal: RoundDeal = {},
): MatchOutcome<S, C, MS> {
  const { def } = session;
  const config = roundConfigFor(def, session.match, roundIndex, session.config);
  const deckOrder = deal.deckOrder ?? session.deckOrders[roundIndex];
  if (session.veiled && !deckOrder) {
    throw new Error(
      `${def.id}: round ${roundIndex} of a veiled match needs its own ceremony deck order`,
    );
  }
  const round = createSession(def.game, {
    seed: roundSeed(session.seed, roundIndex),
    config,
    seats: session.seats,
    veiled: session.veiled,
    deckOrder,
  });
  const deckOrders = deckOrder
    ? withDeckOrder(session.deckOrders, roundIndex, deckOrder)
    : session.deckOrders;
  const opened: MatchSession<S, C, MS> = {
    ...session,
    roundIndex,
    round,
    status: 'playing',
    deckOrders,
  };
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

export interface MatchOptions<C extends RuleValues> {
  seed: number;
  config: C;
  seats: number;
  /**
   * Deal every round under Veil. Each round is its own ceremony, so the first
   * round's `deckOrder` belongs here and every later round supplies one through
   * {@link matchNextRound}.
   */
  veiled?: boolean;
  /** ceremony deck order for round 0; required whenever `veiled` is set */
  deckOrder?: readonly CardId[];
}

export function createMatch<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  opts: MatchOptions<C>,
): MatchOutcome<S, C, MS> {
  const config = def.game.configSchema.resolve(opts.config);
  if (opts.veiled && !def.game.veil) {
    throw new Error(`${def.id}: ${def.game.id} does not support veiled rooms`);
  }
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
    veiled: opts.veiled === true,
    deckOrders: [],
  };
  return openRound(base, 0, { deckOrder: opts.deckOrder });
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

/**
 * Opens the next round. A veiled match must hand in that round's ceremony deck
 * order: re-using the previous one would deal the same hands again, and dealing
 * without one would quietly drop the room back to open cards.
 */
export function matchNextRound<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  session: MatchSession<S, C, MS>,
  deal: RoundDeal = {},
): MatchOutcome<S, C, MS> {
  if (def !== session.def) throw new Error('matchNextRound: def does not match the session');
  if (session.status === 'ended') {
    return rejectMatch(session, 'match-ended', 'the match has already ended');
  }
  if (session.status !== 'round-over') {
    return rejectMatch(session, 'round-playing', 'the current round is not over');
  }
  return openRound(session, session.roundIndex + 1, deal);
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
export interface ReplayMatchOptions<C extends RuleValues> {
  config: C;
  seats: number;
  veiled?: boolean;
  /** ceremony deck orders by round index; required for a veiled match */
  deckOrders?: readonly (readonly CardId[] | undefined)[];
  /** re-check every logged player action instead of trusting the authority */
  verify?: boolean;
}

export function replayMatch<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
  seed: number,
  roundLogs: readonly (readonly AppliedEvent[])[],
  opts: ReplayMatchOptions<C>,
): MatchSession<S, C, MS> {
  const deckOrders = opts.deckOrders ?? [];
  let session = createMatch(def, {
    seed,
    config: opts.config,
    seats: opts.seats,
    veiled: opts.veiled,
    deckOrder: deckOrders[0],
  }).session;
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
      session = matchNextRound(def, session, { deckOrder: deckOrders[i] }).session;
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
      veiled: session.veiled,
      deckOrder: session.deckOrders[i],
      verify: opts.verify,
    });
    if (round.fault) {
      throw new Error(
        `replayMatch: round ${i} event ${round.fault.seq} (${round.fault.move}) failed verification: ${round.fault.error.message}`,
      );
    }
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
