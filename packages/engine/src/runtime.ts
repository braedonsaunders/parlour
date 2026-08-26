import { makeRng } from './rng';
import {
  applyReveals,
  recycleSettled,
  validateRecycle,
  validateReveals,
  type CardRecycle,
  type CardReveal,
} from './veil';
import {
  createFx,
  isActingSeat,
  type AppliedEvent,
  type CardId,
  type SessionOptions,
  type ApplyMeta,
  type ApplyOutcome,
  type FxEmitter,
  type GameDef,
  type GameSession,
  type LegalMove,
  type MatchResult,
  type PhaseState,
  type ReplayFault,
  type ReplayOptions,
  type RuleError,
  type RuleValues,
  type SeatId,
} from './types';

const MAX_AUTO_ROUNDS = 1000;

// ---------------------------------------------------------------------------
// stateHash — stable FNV-1a over canonical JSON
//
// This is a 32-bit checksum for spotting *divergence*, not a cryptographic
// commitment. It answers "did two honest peers drift apart"; it does not answer
// "did this peer doctor the log", because anyone who can edit the log can
// recompute the hash. `verifyLog` is the tool for the second question.
// ---------------------------------------------------------------------------

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const json = JSON.stringify(value);
    return json === undefined ? 'null' : json;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export function stateHash(state: unknown): string {
  const text = canonical(state);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Session construction
// ---------------------------------------------------------------------------

/** Per-event rng stream: derived from (seed, seq) so replay never threads rng state. */
function eventRng(seed: number, seq: number) {
  return makeRng(seed).fork(`ev:${seq}`);
}

function allBots(_seat: SeatId): boolean {
  return true;
}

export function createSession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  opts: SessionOptions<C>,
): GameSession<S, C> {
  const rng = makeRng(opts.seed);
  const fx = createFx();
  const config = def.configSchema.resolve(opts.config);
  if (opts.veiled && !opts.deckOrder) {
    throw new Error(`${def.id}: a veiled session needs the ceremony deck order`);
  }
  const state = def.setup({
    config,
    seats: opts.seats,
    rng,
    fx,
    veiled: opts.veiled === true,
    deckOrder: opts.deckOrder,
  });
  let phase = def.flow.start(state, opts.seats);
  // A match can be over before any move (e.g. a blitz dealt on the deal).
  const initialResult = def.end(state);

  if (initialResult) phase = { ...phase, actor: null };

  return {
    def,
    seed: opts.seed,
    config,
    seats: opts.seats,
    log: [],
    state,
    phase,
    status: initialResult ? 'ended' : 'playing',
    result: initialResult ?? null,
    botsEnabled: allBots,
    setupFx: fx.events.slice(),
    lastAppliedHash: null,
    veiled: opts.veiled === true,
    deckOrder: opts.deckOrder ? [...opts.deckOrder] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

interface StepInput {
  seat: SeatId | null;
  moveId: string;
  payload?: unknown;
  automatic: boolean;
  injected?: boolean;
  atMs?: number;
  reveals?: readonly CardReveal[];
  recycle?: CardRecycle;
}

interface Cursor<S> {
  state: S;
  phase: PhaseState;
  status: 'playing' | 'ended';
  result: MatchResult | null;
  seq: number;
  events: AppliedEvent[];
  /** highest authority time applied so far; carried forward so admission is O(1) */
  lastAtMs?: number;
}

function applyStep<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  cursor: Cursor<S>,
  input: StepInput,
  fx: FxEmitter,
): AppliedEvent {
  const move = def.moves[input.moveId];
  if (!move) throw new Error(`unknown move: ${input.moveId}`);
  const seq = cursor.seq;
  const seat = input.seat ?? -1;
  // Veil openings land before the move, so the reducer that follows sees real
  // card ids and every existing rule keeps working unchanged.
  const opened = applyReveals(cursor.state, input.reveals ?? []);
  const state = move.apply(opened, seat, input.payload, {
    rng: eventRng(seed, seq),
    fx,
    event: input.atMs === undefined ? { seq } : { seq, atMs: input.atMs },
    recycle: input.recycle,
  });
  // A recycle is only honest if the reducer actually swapped the pile: fail
  // loudly rather than play on with a board the audit will reject.
  if (input.recycle) {
    const fault = recycleSettled(state, input.recycle);
    if (fault) throw new Error(`${def.id}: ${fault.message}`);
  }

  const event: AppliedEvent = {
    seq,
    seat: input.seat,
    move: input.moveId,
    payload: input.payload,
    hash: stateHash(state),
  };
  if (input.automatic) event.automatic = true;
  if (input.injected) event.injected = true;
  if (input.atMs !== undefined) event.atMs = input.atMs;
  if (input.reveals && input.reveals.length > 0) {
    event.reveals = input.reveals.map(([handle, card]) => [handle, card] as const);
  }
  if (input.recycle) {
    event.recycle = { retire: [...input.recycle.retire], issue: [...input.recycle.issue] };
  }

  cursor.state = state;
  cursor.seq = seq + 1;
  if (input.atMs !== undefined) cursor.lastAtMs = input.atMs;
  cursor.events.push(event);
  return event;
}

/** Runs flow.advance repeatedly, applying returned autoMoves, until the phase settles. */
function settle<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  seats: number,
  cursor: Cursor<S>,
  trigger: AppliedEvent,
  fx: FxEmitter,
): void {
  let event = trigger;

  for (let round = 0; round < MAX_AUTO_ROUNDS; round++) {
    const advance = def.flow.advance(cursor.state, event, seats);
    cursor.phase = advance.phase;

    if (advance.ended) {
      cursor.status = 'ended';
      cursor.result = advance.ended;
      return;
    }

    const autos = advance.autoMoves ?? [];
    if (autos.length === 0) {
      const ended = def.end(cursor.state);
      if (ended) {
        cursor.status = 'ended';
        cursor.result = ended;
      }
      return;
    }

    for (const auto of autos) {
      event = applyStep(
        def,
        seed,
        cursor,
        {
          seat: auto.seat,
          moveId: auto.move,
          payload: auto.payload,
          automatic: true,
          atMs: event.atMs,
        },
        fx,
      );
    }
  }

  throw new Error(`flow.advance did not settle after ${MAX_AUTO_ROUNDS} rounds`);
}

function rejection<S, C extends RuleValues>(
  session: GameSession<S, C>,
  code: string,
  message: string,
): ApplyOutcome<S, C> {
  return { events: [], fx: [], session, rejected: { code, message } };
}

/**
 * The session's cached authority time, falling back to a scan for sessions that
 * predate the field (a log deserialized by an older peer, say).
 */
function sessionLastAtMs<S, C extends RuleValues>(session: GameSession<S, C>): number | undefined {
  return session.lastAtMs ?? lastAtMsOf(session.log);
}

/**
 * Guards Veil openings before anything else looks at them: only a veiled round
 * may carry reveals, the game must have opted into Veil, and every opening has
 * to conserve the deck (known handle in, unseen face out).
 */
function revealRejection<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  reveals: readonly CardReveal[],
  recycle: CardRecycle | undefined,
): ApplyOutcome<S, C> | null {
  if (reveals.length === 0 && !recycle) return null;
  if (!session.veiled) {
    return rejection(session, 'not-veiled', 'this room is not running the Veil protocol');
  }
  if (!def.veil) {
    return rejection(session, 'veil-unsupported', `${def.id} does not support veiled rooms`);
  }
  const deck = def.veil.deck(session.config);
  const faces = deck.faces;
  for (const [, card] of reveals) {
    if (!Object.hasOwn(faces, card as CardId)) {
      return rejection(session, 'card-not-in-deck', `${String(card)} is not a card in this deck`);
    }
  }
  const fault = validateReveals(session.state, reveals);
  if (fault) return rejection(session, fault.code, fault.message);
  if (!recycle) return null;
  const recycleFault = validateRecycle(
    applyReveals(session.state, reveals),
    recycle,
    deck.cardIds.length,
  );
  return recycleFault ? rejection(session, recycleFault.code, recycleFault.message) : null;
}

/**
 * Admits an authority timestamp against the highest one already logged.
 *
 * The previous time is carried on the session rather than rediscovered by
 * scanning backwards for the last event that carried one. A log with sparse
 * `atMs` made that scan walk to the head, so a match paid O(n²) in total for a
 * check that is O(1) with one cached number.
 */
function timingError(lastAtMs: number | undefined, meta: Readonly<ApplyMeta>): RuleError | null {
  if (meta.atMs === undefined) return null;
  if (!Number.isSafeInteger(meta.atMs) || meta.atMs < 0) {
    return {
      code: 'invalid-event-time',
      message: 'atMs must be a non-negative safe integer',
    };
  }
  if (lastAtMs !== undefined && meta.atMs < lastAtMs) {
    return {
      code: 'event-time-regressed',
      message: `atMs ${meta.atMs} is earlier than the previous authority time ${lastAtMs}`,
    };
  }
  return null;
}

/** Highest authority time in a log, for sessions rebuilt outside applyStep. */
function lastAtMsOf(log: readonly AppliedEvent[]): number | undefined {
  for (let index = log.length - 1; index >= 0; index--) {
    const previous = log[index]?.atMs;
    if (previous !== undefined) return previous;
  }
  return undefined;
}

/** Per-seat legal moves, falling back to the phase-wide list (single-actor games). */
function legalMovesForSeat<S, C extends RuleValues>(
  def: GameDef<S, C>,
  state: S,
  phase: PhaseState,
  seat: SeatId,
): readonly LegalMove[] {
  return def.flow.legalMovesFor
    ? def.flow.legalMovesFor(state, phase, seat)
    : def.flow.legalMoves(state, phase);
}

export function sessionApply<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
  meta: ApplyMeta = {},
): ApplyOutcome<S, C> {
  if (session.status !== 'playing') {
    return rejection(session, 'match-ended', 'the match has already ended');
  }
  if (!isActingSeat(session.phase, seat)) {
    return rejection(session, 'not-your-turn', `seat ${seat} is not an acting seat`);
  }
  const invalidTiming = timingError(sessionLastAtMs(session), meta);
  if (invalidTiming) return rejection(session, invalidTiming.code, invalidTiming.message);

  const reveals = meta.reveals ?? [];
  const revealFault = revealRejection(def, session, reveals, meta.recycle);
  if (revealFault) return revealFault;
  // Legality and validation run against the *opened* board: a veiled hand only
  // becomes legal to play once its handle has been resolved to a real card.
  const opened = applyReveals(session.state, reveals);

  const legal = legalMovesForSeat(def, opened, session.phase, seat);
  const match = legal.find((m) => m.id === moveId);
  if (!match) {
    return rejection(session, 'illegal-move', `move ${moveId} is not legal right now`);
  }
  const move = def.moves[moveId];
  if (!move) {
    return rejection(session, 'unknown-move', `move ${moveId} is not defined by ${def.id}`);
  }

  const effectivePayload = payload === undefined ? match.payload : payload;
  const verdict = move.validate(opened, seat, effectivePayload, { recycle: meta.recycle });
  if (verdict !== true) {
    return { events: [], fx: [], session, rejected: verdict as RuleError };
  }

  const fx = createFx();
  const cursor: Cursor<S> = {
    state: session.state,
    phase: session.phase,
    status: session.status,
    result: session.result,
    seq: session.log.length,
    events: [],
    lastAtMs: sessionLastAtMs(session),
  };

  const event = applyStep(
    def,
    session.seed,
    cursor,
    {
      seat,
      moveId,
      payload: effectivePayload,
      automatic: false,
      atMs: meta.atMs,
      reveals,
      recycle: meta.recycle,
    },
    fx,
  );
  settle(def, session.seed, session.seats, cursor, event, fx);

  const next: GameSession<S, C> = {
    ...session,
    log: [...session.log, ...cursor.events],
    state: cursor.state,
    phase: cursor.phase,
    status: cursor.status,
    result: cursor.result,
    lastAppliedHash:
      cursor.events[cursor.events.length - 1]?.hash ?? session.lastAppliedHash ?? null,
    lastAtMs: cursor.lastAtMs,
  };

  return { events: cursor.events, fx: fx.events, session: next };
}

// ---------------------------------------------------------------------------
// Inject (authoritative system events, e.g. clock ticks)
// ---------------------------------------------------------------------------

/**
 * Applies a seat-less system move on behalf of the transport/authority — the
 * ONLY sanctioned path for wall-clock time (or any other external fact) to
 * reach game state. The game must opt in via `flow.canInject`; the injected
 * payload lands in the log like any event, so replay reproduces it exactly.
 */
export function sessionInject<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  moveId: string,
  payload?: unknown,
  meta: ApplyMeta = {},
): ApplyOutcome<S, C> {
  if (session.status !== 'playing') {
    return rejection(session, 'match-ended', 'the match has already ended');
  }
  const move = def.moves[moveId];
  if (!move) {
    return rejection(session, 'unknown-move', `move ${moveId} is not defined by ${def.id}`);
  }
  if (!def.flow.canInject) {
    return rejection(session, 'injection-unsupported', `${def.id} does not accept injected events`);
  }
  const invalidTiming = timingError(sessionLastAtMs(session), meta);
  if (invalidTiming) return rejection(session, invalidTiming.code, invalidTiming.message);
  const reveals = meta.reveals ?? [];
  const revealFault = revealRejection(def, session, reveals, meta.recycle);
  if (revealFault) return revealFault;
  const verdict = def.flow.canInject(
    applyReveals(session.state, reveals),
    session.phase,
    moveId,
    payload,
    meta,
  );
  if (verdict !== true) {
    return { events: [], fx: [], session, rejected: verdict };
  }

  const fx = createFx();
  const cursor: Cursor<S> = {
    state: session.state,
    phase: session.phase,
    status: session.status,
    result: session.result,
    seq: session.log.length,
    events: [],
    lastAtMs: sessionLastAtMs(session),
  };

  const event = applyStep(
    def,
    session.seed,
    cursor,
    {
      seat: null,
      moveId,
      payload,
      automatic: false,
      injected: true,
      atMs: meta.atMs,
      reveals,
      recycle: meta.recycle,
    },
    fx,
  );
  settle(def, session.seed, session.seats, cursor, event, fx);

  const next: GameSession<S, C> = {
    ...session,
    log: [...session.log, ...cursor.events],
    state: cursor.state,
    phase: cursor.phase,
    status: cursor.status,
    result: cursor.result,
    lastAppliedHash:
      cursor.events[cursor.events.length - 1]?.hash ?? session.lastAppliedHash ?? null,
    lastAtMs: cursor.lastAtMs,
  };

  return { events: cursor.events, fx: fx.events, session: next };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * The automatic events a rules-abiding authority owes after `trigger`.
 *
 * An event tagged `automatic` carries no seat to check and no legality to test,
 * which is why verification used to return early on one. That early return was
 * a hole: a peer could smuggle an arbitrary move into a log by setting the
 * flag, and the audit that exists to catch a cheating host waved it through.
 *
 * There is exactly one honest source for these events — `flow.advance` — so
 * verify mode re-runs the authority's own settle loop on a throwaway cursor and
 * requires the log to match what it produced. The whole sequence is computed at
 * once because `settle` keeps advancing until the phase stops moving; the
 * caller consumes it one event at a time.
 *
 * Returns null when settle refuses to run at all. A flow that cannot settle
 * from this state could not have produced these events either, so the caller
 * treats that the same as owing nothing and lets the mismatch surface as an
 * unexpected automatic event.
 */
function expectedAutoEvents<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  seats: number,
  cursor: Cursor<S>,
  trigger: AppliedEvent,
): AppliedEvent[] | null {
  const shadow: Cursor<S> = { ...cursor, events: [] };
  try {
    settle(def, seed, seats, shadow, trigger, createFx());
  } catch {
    return null;
  }
  return shadow.events;
}

/**
 * True when a logged automatic event is the one settle said should come next.
 *
 * Seat, move and payload are the substantive claim; the hash follows from them
 * and from a state this replay is recomputing anyway, so comparing it would add
 * nothing a divergence check does not already catch.
 */
function autoEventMatches(expected: AppliedEvent, logged: AppliedEvent): boolean {
  return (
    (expected.seat ?? null) === (logged.seat ?? null) &&
    expected.move === logged.move &&
    canonical(expected.payload) === canonical(logged.payload)
  );
}

/**
 * Re-checks one logged event the way `sessionApply` would have.
 *
 * A player action is re-run against legality and validation. An automatic event
 * is checked against `owedAuto` — the next entry `flow.advance` produced for
 * this position — because nothing else about it is checkable. An injected event
 * is admitted by `flow.canInject` below.
 */
function verifyEvent<S, C extends RuleValues>(
  def: GameDef<S, C>,
  cursor: Cursor<S>,
  logged: AppliedEvent,
  index: number,
  owedAuto: AppliedEvent | null,
): ReplayFault | null {
  const fault = (error: RuleError): ReplayFault => ({
    index,
    seq: logged.seq,
    seat: logged.seat,
    move: logged.move,
    error,
  });

  if (!def.moves[logged.move]) {
    return fault({
      code: 'unknown-move',
      message: `move ${logged.move} is not defined by ${def.id}`,
    });
  }
  const timing = timingError(cursor.lastAtMs, { atMs: logged.atMs });
  if (timing) return fault(timing);

  if (logged.automatic === true) {
    if (!owedAuto) {
      return fault({
        code: 'unexpected-automatic',
        message: `${logged.move} is tagged automatic, but flow.advance asked for no move here`,
      });
    }
    return autoEventMatches(owedAuto, logged)
      ? null
      : fault({
          code: 'forged-automatic',
          message: `automatic ${logged.move} is not the ${owedAuto.move} flow.advance produced`,
        });
  }
  if (owedAuto) {
    // Settle runs to completion inside a single apply, so a player action can
    // never land in the middle of one. A log that does it dropped the steps in
    // between — scoring, a redeal — and arrived at a board nobody was owed.
    return fault({
      code: 'skipped-automatic',
      message: `${logged.move} arrived while automatic ${owedAuto.move} was still owed`,
    });
  }

  const opened = applyReveals(cursor.state, logged.reveals ?? []);

  if (logged.injected === true) {
    if (!def.flow.canInject) {
      return fault({
        code: 'injection-unsupported',
        message: `${def.id} does not accept injected events`,
      });
    }
    const verdict = def.flow.canInject(opened, cursor.phase, logged.move, logged.payload, {
      atMs: logged.atMs,
      reveals: logged.reveals,
      recycle: logged.recycle,
    });
    return verdict === true ? null : fault(verdict);
  }

  if (logged.seat === null) {
    return fault({
      code: 'seatless-player-move',
      message: `${logged.move} has no seat but is not automatic or injected`,
    });
  }
  if (!isActingSeat(cursor.phase, logged.seat)) {
    return fault({
      code: 'not-your-turn',
      message: `seat ${logged.seat} is not an acting seat`,
    });
  }
  const legal = legalMovesForSeat(def, opened, cursor.phase, logged.seat);
  if (!legal.some((m) => m.id === logged.move)) {
    return fault({
      code: 'illegal-move',
      message: `move ${logged.move} was not legal at seq ${logged.seq}`,
    });
  }
  const verdict = def.moves[logged.move]!.validate(opened, logged.seat, logged.payload, {
    recycle: logged.recycle,
  });
  return verdict === true ? null : fault(verdict);
}

/**
 * Folds an authoritative log back into a session.
 *
 * By default legality and validation are skipped: the log came from the
 * authority, autoMoves already live in it, and flow.advance is consulted only
 * to track phase and termination. That is what makes rejoin cheap.
 *
 * Pass `verify: true` when the authority is not trusted — in a peer mesh the
 * host is another player, and nothing else in the pipeline would notice a host
 * that logged a move it was not entitled to make. Verification stops at the
 * first bad event and reports it on `session.fault`.
 */
export function replaySession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: ReplayOptions<C>,
): GameSession<S, C> {
  const config = opts?.config ?? def.configSchema.defaults();
  if (opts?.seats === undefined) {
    // Guessing from the log's highest acting seat cannot tell a four-hander
    // where one seat never moved apart from a three-hander, and the wrong seat
    // count silently deals a different game.
    throw new Error(
      `${def.id}: replaySession needs opts.seats — a log does not carry the table size`,
    );
  }
  const seats = opts.seats;
  const base = createSession(def, {
    seed,
    config,
    seats,
    veiled: opts?.veiled,
    deckOrder: opts?.deckOrder,
  });

  const fx = createFx();
  const cursor: Cursor<S> = {
    state: base.state,
    phase: base.phase,
    status: base.status,
    result: base.result,
    seq: 0,
    events: [],
  };

  let fault: ReplayFault | null = null;
  /**
   * Where re-checking starts. Everything before it is taken on trust, which is
   * what a peer wants when it verified those events as they arrived: checking
   * the whole log again on every move would make admission quadratic in the
   * length of the match, and a guest that already refused a bad event is not
   * holding one.
   */
  const verifyFrom = opts?.verifyFrom ?? (opts?.verify === true ? 0 : null);
  const verifying = (index: number): boolean => verifyFrom !== null && index >= verifyFrom;
  /** Automatic events settle says are still owed here, oldest first. */
  let owedAutos: readonly AppliedEvent[] = [];

  for (const [index, logged] of log.entries()) {
    if (cursor.status !== 'playing') break;
    if (verifying(index)) {
      fault = verifyEvent(def, cursor, logged, index, owedAutos[0] ?? null);
      if (fault) break;
    }
    if (logged.automatic === true) owedAutos = owedAutos.slice(1);
    const event = applyStep(
      def,
      seed,
      cursor,
      {
        seat: logged.seat,
        moveId: logged.move,
        payload: logged.payload,
        automatic: logged.automatic === true,
        injected: logged.injected === true,
        atMs: logged.atMs,
        reveals: logged.reveals,
        recycle: logged.recycle,
      },
      fx,
    );

    const advance = def.flow.advance(cursor.state, event, seats);
    cursor.phase = advance.phase;
    if (advance.ended) {
      cursor.status = 'ended';
      cursor.result = advance.ended;
    }
    // Only a player action opens a settle. Re-deriving after each automatic
    // event would recompute the same tail the trigger already produced.
    if (logged.automatic !== true && verifying(index + 1)) {
      owedAutos = expectedAutoEvents(def, seed, seats, cursor, event) ?? [];
    }
  }

  if (fault === null && owedAutos.length > 0 && cursor.status === 'playing') {
    // `sessionApply` settles before it returns, so a well-formed log never stops
    // mid-settle. One that does had its tail cut off — which is how a peer hides
    // a scoring step or a redeal it did not want replayed.
    const owed = owedAutos[0]!;
    fault = {
      index: log.length,
      seq: owed.seq,
      seat: owed.seat,
      move: owed.move,
      error: {
        code: 'truncated-settle',
        message: `log ends while automatic ${owed.move} is still owed`,
      },
    };
  }

  if (cursor.status === 'playing') {
    const ended = def.end(cursor.state);
    if (ended) {
      cursor.status = 'ended';
      cursor.result = ended;
    }
  }

  return {
    ...base,
    log: cursor.events,
    state: cursor.state,
    phase: cursor.phase,
    status: cursor.status,
    result: cursor.result,
    lastAppliedHash: cursor.events[cursor.events.length - 1]?.hash ?? null,
    lastAtMs: cursor.lastAtMs,
    fault,
  };
}

/**
 * Replays a log with every player action re-checked, and reports the first one
 * that a rules-abiding authority could not have produced.
 *
 * This is the answer to "can I trust this peer's log", which the event hash
 * deliberately is not — that hash detects drift between honest peers and is
 * forgeable by a dishonest one.
 */
export function verifyLog<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: ReplayOptions<C>,
): ReplayFault | null {
  return replaySession(def, seed, log, { ...opts, verify: true }).fault ?? null;
}

/**
 * True when a replayed session reproduces the authority's final hash — i.e. the
 * two agree on what happened. A doctored log agrees with itself, so this is a
 * desync check and not an integrity check; see {@link verifyLog}.
 */
export function replayMatchesLog(hash: string | null | undefined, log: readonly AppliedEvent[]) {
  const expected = log[log.length - 1]?.hash;
  return expected === undefined || expected === hash;
}
