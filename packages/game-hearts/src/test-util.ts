import {
  createSession,
  sessionApply,
  type AppliedEvent,
  type GameSession,
  type SeatId,
} from '@parlour/engine';
import { heartsConfigSchema, type HeartsRules } from './config';
import type { HeartsState } from './state';
import { heartsGame } from './game';

export type HeartsSession = GameSession<HeartsState, HeartsRules>;

export function openSession(
  opts: { seed?: number; config?: Partial<HeartsRules>; seats?: number } = {},
): HeartsSession {
  return createSession(heartsGame, {
    seed: opts.seed ?? 7,
    config: heartsConfigSchema.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

export interface StepResult {
  session: HeartsSession;
  events: readonly AppliedEvent[];
  fx: import('@parlour/engine').FxEvent[];
  rejected?: string;
}

/** Applies one move and returns the next session (asserting acceptance by default). */
export function step(
  session: HeartsSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): StepResult {
  const outcome = sessionApply(heartsGame, session, seat, moveId, payload);
  if (outcome.rejected) {
    return { session, events: [], fx: [], rejected: outcome.rejected.code };
  }
  return { session: outcome.session, events: outcome.events, fx: [...outcome.fx] };
}

export function mustStep(
  session: HeartsSession,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
): HeartsSession {
  const result = step(session, seat, moveId, payload);
  if (result.rejected) {
    throw new Error(`${seat}/${moveId} rejected: ${result.rejected}`);
  }
  return result.session;
}

/**
 * Drives a full open-room hand with a per-seat play policy. Passes pick the
 * three highest cards; plays consult `chooseCard` (default: lowest legal).
 */
export function driveHand(
  session: HeartsSession,
  chooseCard?: (state: HeartsState, seat: SeatId, cards: string[]) => string | undefined,
): HeartsSession {
  let current = session;
  let guard = 0;
  while (current.status === 'playing') {
    if (guard++ > 400) throw new Error('driveHand exceeded 400 steps');
    const phase = current.phase;
    if (phase.phase === 'pass') {
      const pending: SeatId[] = [];
      current.state.selections.forEach((picked: unknown, seat: number) => {
        if (picked === null) pending.push(seat as SeatId);
      });
      for (const seat of pending) {
        const hand = [...(current.state.hands[seat] ?? [])].sort();
        current = mustStep(current, seat, 'passCards', { cards: hand.slice(-3) });
      }
      continue;
    }
    if (phase.phase === 'play') {
      const seat = current.state.turn;
      const legal = legalPlayCardsFor(current, seat);
      const chosen = chooseCard?.(current.state, seat, legal) ?? lowestOf(legal);
      if (!chosen) throw new Error(`no playable card for seat ${seat}`);
      current = mustStep(current, seat, 'playCard', { card: chosen });
      continue;
    }
    break;
  }
  return current;
}

function legalPlayCardsFor(session: HeartsSession, seat: SeatId): string[] {
  const moves = heartsGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
  return moves.flatMap((move) =>
    move.id === 'playCard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

function lowestOf(cards: readonly string[]): string | undefined {
  return [...cards].sort(
    (a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10),
  )[0];
}
