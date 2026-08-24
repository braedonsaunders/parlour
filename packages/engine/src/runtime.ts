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
  type RuleError,
  type RuleValues,
  type SeatId,
} from './types';

const MAX_AUTO_ROUNDS = 1000;

// ---------------------------------------------------------------------------
// stateHash — stable FNV-1a over canonical JSON
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

function timingError(log: readonly AppliedEvent[], meta: Readonly<ApplyMeta>): RuleError | null {
  if (meta.atMs === undefined) return null;
  if (!Number.isSafeInteger(meta.atMs) || meta.atMs < 0) {
    return {
      code: 'invalid-event-time',
      message: 'atMs must be a non-negative safe integer',
    };
  }
  for (let index = log.length - 1; index >= 0; index--) {
    const previous = log[index]?.atMs;
    if (previous === undefined) continue;
    return meta.atMs < previous
      ? {
          code: 'event-time-regressed',
          message: `atMs ${meta.atMs} is earlier than the previous authority time ${previous}`,
        }
      : null;
  }
  return null;
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
  const invalidTiming = timingError(session.log, meta);
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
      conceals,
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
  const invalidTiming = timingError(session.log, meta);
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
  };

  return { events: cursor.events, fx: fx.events, session: next };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

function deriveSeats(log: readonly AppliedEvent[]): number {
  let max = -1;
  for (const e of log) if (e.seat !== null && e.seat > max) max = e.seat;
  return Math.max(2, max + 1);
}

/**
 * Folds an authoritative log back into a session. Legality/validation are skipped
 * (the log came from an authority); autoMoves already live in the log, so
 * flow.advance is consulted only to track phase and termination.
 */
export function replaySession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: { config?: C; seats?: number; veiled?: boolean; deckOrder?: readonly CardId[] },
): GameSession<S, C> {
  const config = opts?.config ?? def.configSchema.defaults();
  const seats = opts?.seats ?? deriveSeats(log);
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

  for (const logged of log) {
    if (cursor.status !== 'playing') break;
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
  };
}

/** True when a replayed session reproduces the authority's final hash. */
export function replayMatchesLog(hash: string | null | undefined, log: readonly AppliedEvent[]) {
  const expected = log[log.length - 1]?.hash;
  return expected === undefined || expected === hash;
}
