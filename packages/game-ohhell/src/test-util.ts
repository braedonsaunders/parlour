import {
  createSession,
  sessionApply,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type Move,
  type SeatId,
} from '@parlour/engine';
import { ohhellConfig, type OhHellRules } from './config';
import { createOhHellDef, ohhellGame } from './game';
import type { OhHellState } from './state';

export type OhHellSession = GameSession<OhHellState, OhHellRules>;

export function openSession(
  opts: {
    seed?: number;
    config?: Partial<OhHellRules>;
    seats?: number;
  } = {},
): OhHellSession {
  return createSession(ohhellGame, {
    seed: opts.seed ?? 7,
    config: ohhellConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

export interface StepResult {
  session: OhHellSession;
  events: readonly AppliedEvent[];
  fx: FxEvent[];
  rejected?: string;
}

export function step(
  session: OhHellSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(ohhellGame, session, seat, moveId, payload);
  if (outcome.rejected) {
    return { session, events: [], fx: [], rejected: outcome.rejected.code };
  }
  return { session: outcome.session, events: outcome.events, fx: [...outcome.fx] };
}

export function mustStep(
  session: OhHellSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): OhHellSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) {
    throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  }
  return result.session;
}

export function requireMove(id: string): Move<OhHellState> {
  const move = createOhHellDef().moves[id];
  if (!move) throw new Error(`ohhell is missing move "${id}"`);
  return move;
}

/** Legal bid payloads for `seat` right now (empty unless they hold the turn). */
export function legalBidValues(session: OhHellSession, seat: SeatId): number[] {
  const moves =
    ohhellGame.flow.legalMovesFor?.(session.state, session.phase, seat) ??
    ohhellGame.flow.legalMoves(session.state, session.phase);
  return moves.flatMap((move) =>
    move.id === 'bid' && typeof (move.payload as { bid?: unknown }).bid === 'number'
      ? [(move.payload as { bid: number }).bid]
      : [],
  );
}

export function legalCards(session: OhHellSession, seat: SeatId): string[] {
  const moves =
    ohhellGame.flow.legalMovesFor?.(session.state, session.phase, seat) ??
    ohhellGame.flow.legalMoves(session.state, session.phase);
  return moves.flatMap((move) =>
    move.id === 'playCard' && typeof (move.payload as { card?: unknown }).card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

/**
 * Bids around the table in TURN ORDER (starting left of the dealer).
 * A value of 0 bids zero — legal in Oh Hell without any special move.
 */
export function bidAround(session: OhHellSession, bids: readonly number[]): OhHellSession {
  let current = session;
  const seats = current.state.seats;
  for (let i = 0; i < seats; i++) {
    if (current.state.stage !== 'bidding') break;
    const seat = current.state.turn;
    const value = bids[i] ?? Math.min(1, current.state.handSize);
    // The hook rule may forbid a scripted value at the dealer — fall back to
    // the nearest still-legal bid so drivers stay declarative.
    const allowed = legalBidValues(current, seat);
    const chosen = allowed.includes(value)
      ? value
      : (allowed.reduce((best, candidate) =>
          Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
        ) as number);
    current = mustStep(current, seat, 'bid', { bid: chosen });
  }
  return current;
}

/** Plays every remaining trick taking the lowest legal card each time. */
export function playOut(session: OhHellSession, guardLimit = 400): OhHellSession {
  let current = session;
  let guard = 0;
  while (current.state.stage === 'playing') {
    if (guard++ > guardLimit) throw new Error('playOut exceeded its guard');
    const seat = current.state.turn;
    const cards = legalCards(current, seat);
    const chosen = cards.sort()[0];
    if (!chosen) throw new Error(`no playable card for seat ${seat}`);
    current = mustStep(current, seat, 'playCard', { card: chosen });
  }
  return current;
}
