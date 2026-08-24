import {
  createSession,
  sessionApply,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type SeatId,
} from '@parlour/engine';
import { pokerConfig, type PokerRules } from './config';
import { pokerGame } from './game';
import type { PokerState } from './state';

export type PokerSession = GameSession<PokerState, PokerRules>;

export function openSession(
  opts: { seed?: number; config?: Partial<PokerRules>; seats?: number } = {},
): PokerSession {
  return createSession(pokerGame, {
    seed: opts.seed ?? 11,
    config: pokerConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

export interface StepResult {
  session: PokerSession;
  events: readonly AppliedEvent[];
  fx: FxEvent[];
  rejected?: string;
}

export function step(
  session: PokerSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(pokerGame, session, seat, moveId, payload);
  if (outcome.rejected) {
    return { session, events: [], fx: [], rejected: outcome.rejected.code };
  }
  return { session: outcome.session, events: outcome.events, fx: [...outcome.fx] };
}

export function mustStep(
  session: PokerSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): PokerSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  return result.session;
}

export function legalFor(session: PokerSession, seat: SeatId): LegalMove[] {
  return [
    ...(pokerGame.flow.legalMovesFor?.(session.state, session.phase, seat) ??
      pokerGame.flow.legalMoves(session.state, session.phase)),
  ];
}

export function legalIds(session: PokerSession, seat: SeatId): string[] {
  return [...new Set(legalFor(session, seat).map((move) => move.id))];
}

/** Chips on the table plus chips in the middle — invariant across a whole match. */
export function chipsInPlay(state: PokerState): number {
  const stacks = state.stacks.reduce((sum, amount) => sum + amount, 0);
  const pot = state.committed.reduce((sum, amount) => sum + amount, 0);
  return stacks + pot;
}

/** Acts for whoever is to act, using the first legal move matching `prefer`. */
export function actWith(session: PokerSession, prefer: readonly string[]): PokerSession {
  const seat = session.state.turn;
  if (seat === null) throw new Error('nobody is to act');
  const legal = legalFor(session, seat);
  for (const id of prefer) {
    const move = legal.find((candidate) => candidate.id === id);
    if (move) return mustStep(session, seat, move.id, move.payload);
  }
  const fallback = legal[0];
  if (!fallback) throw new Error(`seat ${seat} has no legal move`);
  return mustStep(session, seat, fallback.id, fallback.payload);
}

/** Everyone folds to the big blind, or checks it down when nothing is owed. */
export function foldAround(session: PokerSession, guard = 60): PokerSession {
  let current = session;
  let steps = 0;
  const startHand = current.state.handNo;
  while (current.status === 'playing' && current.state.handNo === startHand) {
    if (current.state.turn === null) break;
    if (steps++ > guard) throw new Error('foldAround did not finish a hand');
    current = actWith(current, ['fold', 'check']);
  }
  return current;
}
