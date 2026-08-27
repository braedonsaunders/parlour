import {
  createSession,
  sessionApply,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type Move,
  type SeatId,
} from '@parlour/engine';
import { pinochleConfig, type PinochleRules } from './config';
import { createPinochleDef, pinochleGame } from './rules';
import type { PinochleState } from './state';

export type PinochleSession = GameSession<PinochleState, PinochleRules>;

export function openSession(
  opts: { seed?: number; config?: Partial<PinochleRules>; seats?: number } = {},
): PinochleSession {
  return createSession(pinochleGame, {
    seed: opts.seed ?? 7,
    config: pinochleConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

export interface StepResult {
  session: PinochleSession;
  events: readonly AppliedEvent[];
  fx: FxEvent[];
  rejected?: string;
}

export function step(
  session: PinochleSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(pinochleGame, session, seat, moveId, payload);
  if (outcome.rejected) {
    return { session, events: [], fx: [], rejected: outcome.rejected.code };
  }
  return { session: outcome.session, events: outcome.events, fx: [...outcome.fx] };
}

export function mustStep(
  session: PinochleSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): PinochleSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) {
    throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  }
  return result.session;
}

export function requireMove(id: string): Move<PinochleState> {
  const move = createPinochleDef().moves[id];
  if (!move) throw new Error(`pinochle is missing move "${id}"`);
  return move;
}

/** One seat bids, everyone else passes — that seat wins the auction. */
export function winAuction(session: PinochleSession, bidAmount = 25): PinochleSession {
  let current = session;
  const bidder = current.state.turn;
  current = mustStep(current, bidder, 'bid', { bid: bidAmount });
  let guard = 0;
  while (current.state.stage === 'bidding') {
    if (guard++ > 8) throw new Error('winAuction: auction did not conclude');
    current = mustStep(current, current.state.turn, 'pass');
  }
  return current;
}

export function nameTrump(session: PinochleSession, suit: string): PinochleSession {
  const bidder = session.state.highBidder as SeatId;
  return mustStep(session, bidder, 'nameTrump', { suit });
}

/** Confirms meld for all four seats — simultaneous, so order does not matter. */
export function confirmAllMeld(session: PinochleSession): PinochleSession {
  let current = session;
  for (let seat = 0; seat < 4; seat++) {
    current = mustStep(current, seat as SeatId, 'confirmMeld');
  }
  return current;
}

export function legalCards(session: PinochleSession, seat: SeatId): string[] {
  const moves =
    pinochleGame.flow.legalMovesFor?.(session.state, session.phase, seat) ??
    pinochleGame.flow.legalMoves(session.state, session.phase);
  return moves.flatMap((move) =>
    move.id === 'playCard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

/** Drives a full auction → trump → meld sequence, then plays lowest-legal cards throughout. */
export function driveHand(session: PinochleSession, bidAmount = 25, trump = 'S'): PinochleSession {
  let current = session.state.stage === 'bidding' ? winAuction(session, bidAmount) : session;
  if (current.state.stage === 'naming-trump') current = nameTrump(current, trump);
  if (current.state.stage === 'melding') current = confirmAllMeld(current);
  let guard = 0;
  while (current.status === 'playing' && current.state.stage === 'playing') {
    if (guard++ > 60) throw new Error('driveHand exceeded 60 plays');
    const seat = current.state.turn;
    const cards = legalCards(current, seat);
    const chosen = cards[0];
    if (!chosen) throw new Error(`no playable card for seat ${seat}`);
    current = mustStep(current, seat, 'playCard', { card: chosen });
  }
  return current;
}
