import { makeRng } from './rng';
import {
  createFx,
  type AppliedEvent,
  type ApplyOutcome,
  type FxEmitter,
  type GameDef,
  type GameSession,
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
  opts: { seed: number; config: C; seats: number },
): GameSession<S, C> {
  const rng = makeRng(opts.seed);
  const fx = createFx();
  const config = def.configSchema.resolve(opts.config);
  const state = def.setup({ config, seats: opts.seats, rng, fx });
  const phase = def.flow.start(state, opts.seats);

  return {
    def,
    seed: opts.seed,
    config,
    seats: opts.seats,
    log: [],
    state,
    phase,
    status: 'playing',
    result: null,
    botsEnabled: allBots,
    setupFx: fx.events.slice(),
    lastAppliedHash: null,
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
  const state = move.apply(cursor.state, seat, input.payload, { rng: eventRng(seed, seq), fx });

  const event: AppliedEvent = {
    seq,
    seat: input.seat,
    move: input.moveId,
    payload: input.payload,
    hash: stateHash(state),
  };
  if (input.automatic) event.automatic = true;

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
        { seat: auto.seat, moveId: auto.move, payload: auto.payload, automatic: true },
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

export function sessionApply<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): ApplyOutcome<S, C> {
  if (session.status !== 'playing') {
    return rejection(session, 'match-ended', 'the match has already ended');
  }
  if (session.phase.actor !== seat) {
    return rejection(session, 'not-your-turn', `seat ${seat} is not the acting seat`);
  }

  const legal = def.flow.legalMoves(session.state, session.phase);
  const match = legal.find((m) => m.id === moveId);
  if (!match) {
    return rejection(session, 'illegal-move', `move ${moveId} is not legal right now`);
  }
  const move = def.moves[moveId];
  if (!move) {
    return rejection(session, 'unknown-move', `move ${moveId} is not defined by ${def.id}`);
  }

  const effectivePayload = payload === undefined ? match.payload : payload;
  const verdict = move.validate(session.state, seat, effectivePayload);
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
    { seat, moveId, payload: effectivePayload, automatic: false },
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
  opts?: { config?: C; seats?: number },
): GameSession<S, C> {
  const config = opts?.config ?? def.configSchema.defaults();
  const seats = opts?.seats ?? deriveSeats(log);
  const base = createSession(def, { seed, config, seats });

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
