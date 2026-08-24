import type { SeatId } from '@parlour/engine';
import type { ScoringScheme } from './config';
import type { RoundSummary } from './state';

export const EXACT_BONUS = 10;

/**
 * Points for one seat's round. Every scheme pays only on an EXACT make —
 * that is the heart of Oh Hell; they differ on what a miss costs:
 *  - exactOnly: 10 + bid, else nothing (default)
 *  - penalty:   10 + bid, else minus the absolute miss
 *  - plusOne:   bid + 1 per trick taken — on an exact make that is twice the bid
 */
export function scoreBid(bid: number, taken: number, scheme: ScoringScheme): number {
  if (bid === taken) {
    switch (scheme) {
      case 'exactOnly':
        return EXACT_BONUS + bid;
      case 'penalty':
        return EXACT_BONUS + bid;
      case 'plusOne':
        return bid + taken;
    }
  }
  switch (scheme) {
    case 'exactOnly':
      return 0;
    case 'penalty':
      return -Math.abs(bid - taken);
    case 'plusOne':
      return 0;
  }
}

export function scoreRound(
  bids: readonly number[],
  tricksWon: readonly number[],
  scheme: ScoringScheme,
): number[] {
  return bids.map((bid, seat) => scoreBid(bid, tricksWon[seat] ?? 0, scheme));
}

export function buildSummary(input: {
  handSize: number;
  dealer: SeatId;
  trumpSuit: string | null;
  bids: readonly number[];
  tricksWon: readonly number[];
  scheme: ScoringScheme;
}): RoundSummary {
  const points = scoreRound(input.bids, input.tricksWon, input.scheme);
  return {
    handSize: input.handSize,
    dealer: input.dealer,
    trumpSuit: input.trumpSuit,
    bids: [...input.bids],
    tricksWon: [...input.tricksWon],
    points,
  };
}

/**
 * Ranks a finished round (or match) by score, highest first, ties sharing a
 * rank. `winner` is set only for a unique leader — a tied top is nobody's win.
 */
export function rankByScore(
  scores: readonly number[],
  reason: string,
  detailOf?: (seat: SeatId) => Record<string, number | string | boolean>,
): {
  winner: SeatId | null;
  rankings: { seat: SeatId; rank: number; detail?: Record<string, number | string | boolean> }[];
} {
  const ordered = scores
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => b.value - a.value || a.seat - b.seat);
  let priorValue = Number.NaN;
  let priorRank = 0;
  const rankings = ordered.map(({ seat, value }, index) => {
    if (value !== priorValue) priorRank = index + 1;
    priorValue = value;
    const detail = detailOf?.(seat);
    return detail === undefined ? { seat, rank: priorRank } : { seat, rank: priorRank, detail };
  });
  const leaders = rankings.filter((row) => row.rank === 1);
  return { winner: leaders.length === 1 ? (leaders[0] as { seat: SeatId }).seat : null, rankings };
}
