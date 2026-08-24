import {
  createFx,
  makeRng,
  sessionApply,
  createSession,
  type FxEmitter,
  type GameSession,
  type MoveCtx,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import { scopaConfig, type ScopaRules } from './config';
import { scopaGame } from './game';
import { ownerCount } from './cards';
import type { ScopaState } from './state';

export type ScopaSession = GameSession<ScopaState, ScopaRules>;

export function openSession(
  opts: { seed?: number; config?: Partial<ScopaRules>; seats?: number } = {},
): ScopaSession {
  return createSession(scopaGame, {
    seed: opts.seed ?? 7,
    config: scopaConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 2,
  });
}

export interface StepResult {
  session: ScopaSession;
  rejected?: string;
}

export function step(
  session: ScopaSession,
  seat: SeatId | null,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(scopaGame, session, seat as SeatId, moveId, payload);
  if (outcome.rejected) {
    return { session, rejected: outcome.rejected.code };
  }
  return { session: outcome.session };
}

export function mustStep(
  session: ScopaSession,
  seat: SeatId | null,
  moveId: string,
  payload?: unknown,
): ScopaSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) {
    throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  }
  return result.session;
}

/** A MoveCtx for direct reducer calls in unit tests (tests are purity-exempt). */
export function makeCtx(seed = 1): { ctx: MoveCtx; fx: FxEmitter; rng: Rng } {
  const fx = createFx();
  const rng = makeRng(seed);
  return { ctx: { rng, fx, event: { seq: 0 } }, fx, rng };
}

interface MakeStateOpts {
  seats?: number;
  hands?: CardId[][];
  table?: CardId[];
  stock?: CardId[];
  captures?: CardId[][];
  scope?: number[];
  lastCapturer?: SeatId | null;
  turn?: SeatId;
  stage?: 'playing' | 'round-over';
}

type CardId = string;

/** Builds a minimal valid state for reducer-level tests; sizes zones to seats. */
export function makeState(opts: MakeStateOpts = {}): ScopaState {
  const seats = opts.seats ?? 2;
  const owners = ownerCount(seats);
  return {
    rules: scopaConfig.resolve({}),
    seats,
    roundNo: 1,
    dealer: 0,
    hands: opts.hands ?? Array.from({ length: seats }, () => []),
    stock: opts.stock ?? [],
    table: opts.table ?? [],
    captures: opts.captures ?? Array.from({ length: seats }, () => []),
    scope: opts.scope ?? new Array<number>(seats).fill(0),
    lastCapturer: opts.lastCapturer ?? null,
    stage: opts.stage ?? 'playing',
    turn: opts.turn ?? 0,
    scores: new Array<number>(owners).fill(0),
    summary: null,
    lastRound: null,
  };
}

export interface ParsedPlay {
  card: string;
  take: string[];
}

export function legalPlays(session: ScopaSession): ParsedPlay[] {
  const moves =
    scopaGame.flow.legalMovesFor?.(session.state, session.phase, session.state.turn) ?? [];
  return moves.flatMap((move) => {
    const payload = move.payload as { card?: unknown; take?: unknown } | undefined;
    if (move.id !== 'playCard' || typeof payload?.card !== 'string') return [];
    return [
      {
        card: payload.card,
        take: Array.isArray(payload.take)
          ? payload.take.filter((id): id is string => typeof id === 'string')
          : [],
      },
    ];
  });
}

/**
 * Plays capture-if-offered (else lowest-card) moves until the session leaves
 * `playing` — enough to walk a round end-to-end without bot machinery.
 */
export function driveToRoundEnd(session: ScopaSession, maxSteps = 400): ScopaSession {
  let current = session;
  let guard = 0;
  while (current.status === 'playing' && current.phase.phase !== 'over') {
    if (guard++ > maxSteps) throw new Error('driveToRoundEnd exceeded step budget');
    const seat = current.phase.actor;
    if (seat === null || seat === undefined) break;
    const plays = legalPlays(current);
    if (plays.length === 0) break;
    const withTake = plays.find((play) => play.take.length > 0);
    const chosen =
      withTake ??
      plays.reduce((low, play) =>
        Number.parseInt(play.card.slice(1), 10) < Number.parseInt(low.card.slice(1), 10)
          ? play
          : low,
      );
    current = mustStep(current, seat, 'playCard', { card: chosen.card, take: chosen.take });
  }
  return current;
}
