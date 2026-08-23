import type { MatchResult, MatchResultRank, SeatId } from '@parlour/engine';
import { handValue } from './hand';
import type { BlitzState, RoundOutcome } from './state';

/**
 * Showdown scoring (spec §5.1): lowest hand loses. If the knocker is lowest or
 * tied for lowest, the knocker takes the penalty instead — overriding
 * `tieLowest`. A tied lowest without a knocker follows `tieLowest`.
 */
export function scoreRound(state: BlitzState): RoundOutcome {
  const config = state.rules;
  const seats = Array.from({ length: state.seats }, (_, i) => i as SeatId);
  const values = new Map<SeatId, number>(
    seats.map((seat) => [seat, handValue(state.hands[seat] ?? [], config)]),
  );

  // 1. who takes the loss?
  let losers: readonly SeatId[];
  const lowValue = Math.min(...values.values());
  const lowGroup = seats.filter((s) => values.get(s) === lowValue);

  if (state.knocker !== null && lowGroup.includes(state.knocker)) {
    // the knocker takes the penalty instead of anyone tied with them
    losers = [state.knocker];
  } else if (lowGroup.length > 1) {
    switch (config.tieLowest) {
      case 'both':
        losers = lowGroup;
        break;
      case 'nobody':
        losers = [];
        break;
      case 'redeal':
        return { reason: 'redeal', winners: [], rankings: [] };
    }
  } else {
    losers = lowGroup;
  }

  // 2. everyone else ranks by value (desc); the top of that order wins
  const loserSet = new Set(losers);
  const surviving = seats
    .filter((s) => !loserSet.has(s))
    .sort(
      (a, b) => (values.get(b) as number) - (values.get(a) as number) || a - b,
    );

  const topSurviving = surviving[0];
  if (topSurviving === undefined) {
    // every seat lost (impossible today: the knocker rule spares one seat) —
    // fail loudly rather than crown nobody silently.
    throw new Error('scoreRound: no surviving seat to rank first');
  }
  const survivorsTop = values.get(topSurviving) as number;
  const winners = surviving.filter((s) => values.get(s) === survivorsTop);

  // 3. rankings: winners first, then the rest by value, losers last
  const runnerUp = surviving.slice(winners.length);
  const ordered = [...winners.slice().sort((a, b) => a - b), ...runnerUp, ...losers.slice().sort((a, b) => a - b)];
  const rankings: MatchResultRank[] = ordered.map((seat, index) => ({
    seat,
    rank: winners.includes(seat) ? 1 : index + 1,
    detail: { handValue: values.get(seat) as number },
  }));

  return { reason: 'showdown', winners, rankings };
}

export function matchResultOf(outcome: RoundOutcome): MatchResult {
  const soleWinner = outcome.winners.length === 1 ? (outcome.winners[0] as SeatId) : null;
  return {
    winner: soleWinner,
    rankings: outcome.rankings.map((r) => ({ ...r })),
    reason: outcome.reason,
  };
}
