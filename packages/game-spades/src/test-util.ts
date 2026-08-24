import {
  createSession,
  sessionApply,
  type AppliedEvent,
  type GameSession,
  type Move,
  type SeatId,
} from '@parlour/engine';
import { spadesConfig, type SpadesRules } from './config';
import { createSpadesDef, spadesGame } from './game';
import type { SpadesState } from './state';

export type SpadesSession = GameSession<SpadesState, SpadesRules>;

export function openSession(
  opts: { seed?: number; config?: Partial<SpadesRules>; seats?: number } = {},
): SpadesSession {
  const def = spadesGame;
  return createSession(def, {
    seed: opts.seed ?? 7,
    config: spadesConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

export interface StepResult {
  session: SpadesSession;
  events: readonly AppliedEvent[];
  fx: import('@parlour/engine').FxEvent[];
  rejected?: string;
}

export function step(
  session: SpadesSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(spadesGame, session, seat, moveId, payload);
  if (outcome.rejected) {
    return { session, events: [], fx: [], rejected: outcome.rejected.code };
  }
  return { session: outcome.session, events: outcome.events, fx: [...outcome.fx] };
}

export function mustStep(
  session: SpadesSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): SpadesSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) {
    throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  }
  return result.session;
}

export function bidAround(
  session: SpadesSession,
  bids: readonly (number | 'nil')[],
): SpadesSession {
  let current = session;
  for (let i = 0; i < 4; i++) {
    const seat = current.state.turn;
    const value = bids[i] ?? 3;
    current =
      value === 'nil' || value === 0
        ? mustStep(current, seat, 'bidNil')
        : mustStep(current, seat, 'bid', { bid: value });
  }
  return current;
}

export function requireMove(id: string): Move<SpadesState> {
  const move = createSpadesDef().moves[id];
  if (!move) throw new Error(`spades is missing move "${id}"`);
  return move;
}

export function legalCards(session: SpadesSession, seat: SeatId): string[] {
  const moves =
    spadesGame.flow.legalMovesFor?.(session.state, session.phase, seat) ??
    spadesGame.flow.legalMoves(session.state, session.phase);
  return moves.flatMap((move) =>
    move.id === 'playCard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

/** Drives bids then lowest-legal play until the session leaves `playing` or ends. */
export function driveHand(
  session: SpadesSession,
  bids: readonly number[] = [3, 3, 3, 3],
): SpadesSession {
  let current = session.phase.phase === 'bidding' ? bidAround(session, bids) : session;
  let guard = 0;
  while (current.status === 'playing' && current.state.stage === 'playing') {
    if (guard++ > 80) throw new Error('driveHand exceeded 80 plays');
    const seat = current.state.turn;
    const cards = legalCards(current, seat);
    const chosen = [...cards].sort(
      (a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10),
    )[0];
    if (!chosen) throw new Error(`no playable card for seat ${seat}`);
    current = mustStep(current, seat, 'playCard', { card: chosen });
  }
  return current;
}
