import type { MatchResult, MatchResultRank, SeatId } from '@parlour/engine';
import type { SpiteState } from './state';

/**
 * Spite & Malice keeps no points — the ranking is pure position: who has
 * cleared their payoff pile, and how close everyone else came. These helpers
 * are the single source of that arithmetic for `end`, the flow, and any UI.
 */

/** Cards still buried (or sitting exposed) in a seat's payoff pile. */
export function payoffRemaining(state: Pick<SpiteState, 'payoffs'>, seat: SeatId): number {
  return state.payoffs[seat]?.length ?? 0;
}

/**
 * How far a seat has driven their race, 0..1. The exposed top counts as
 * remaining until it actually lands on a centre pile — being one flip from
 * victory is not victory.
 */
export function progress(state: Pick<SpiteState, 'rules' | 'payoffs'>, seat: SeatId): number {
  const total = Math.max(1, state.rules.payoffSize);
  return Math.min(1, Math.max(0, 1 - payoffRemaining(state, seat) / total));
}

/**
 * Closest-to-victory order for seats without a claim on first place: fewest
 * payoff cards left wins the tiebreak, then the smaller hand, then seat order,
 * so every replay produces exactly one ranking.
 */
export function rankChasers(
  state: Pick<SpiteState, 'payoffs' | 'hands'>,
  exclude?: SeatId | null,
): MatchResultRank[] {
  return state.payoffs
    .map((_, seat) => seat)
    .filter((seat) => seat !== exclude)
    .map((seat) => ({
      seat,
      payoff: payoffRemaining(state, seat),
      hand: state.hands[seat]?.length ?? 0,
    }))
    .sort((a, b) => a.payoff - b.payoff || a.hand - b.hand || a.seat - b.seat)
    .map(({ seat, payoff, hand }, index) => ({
      seat,
      rank: index + 2,
      detail: { payoff, hand },
    }));
}

/**
 * The match result, or null while play continues. A winner exists only when a
 * payoff pile has been played empty; a table where every seat is stuck is
 * settled by {@link rankChasers} rather than stalling.
 */
export function matchResult(state: SpiteState): MatchResult | null {
  if (state.winner !== null) {
    const winner = state.winner;
    return {
      winner,
      rankings: [{ seat: winner, rank: 1, detail: { payoff: 0 } }, ...rankChasers(state, winner)],
      reason: 'payoff-cleared',
    };
  }
  if (state.stuckRuns >= state.seats) {
    const ordered = [...state.payoffs.keys()]
      .map((seat) => ({
        seat,
        payoff: payoffRemaining(state, seat),
        hand: state.hands[seat]?.length ?? 0,
      }))
      .sort((a, b) => a.payoff - b.payoff || a.hand - b.hand || a.seat - b.seat);
    return {
      winner: ordered[0]?.seat ?? null,
      rankings: ordered.map(({ seat, payoff, hand }, index) => ({
        seat,
        rank: index + 1,
        detail: { payoff, hand, stuck: index === 0 },
      })),
      reason: 'table-locked',
    };
  }
  return null;
}
