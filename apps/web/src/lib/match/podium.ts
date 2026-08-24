import type { MatchResult } from '@parlour/engine';
import { toSeatView, type SeatInfo, type SeatView } from '@/lib/seats';

/**
 * Podium view model (spec §6.6): turns the engine's pinned MatchResult into a
 * staggered trading-card plaques plan. Pure — no React, fully unit-tested.
 */

export interface PodiumEntry extends SeatView {
  rank: number;
  isWinner: boolean;
  blitzes: number;
  knockWins: number;
  livesLeft: number | null;
  /** Wild's ranking detail: cards still in hand when the deal ended. */
  cardsLeft: number | null;
}

function detailNumber(
  detail: Record<string, number | string | boolean> | undefined,
  key: string,
): number {
  const value = detail?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function derivePodium(result: MatchResult, seats: readonly SeatInfo[]): PodiumEntry[] {
  const known = new Map(seats.map((info) => [info.seat, info]));

  const entries: PodiumEntry[] = [];
  for (const ranking of result.rankings) {
    const info = known.get(ranking.seat);
    if (!info) continue;
    const view: SeatView = toSeatView(info);
    const livesRaw = ranking.detail?.livesLeft;
    const cardsRaw = ranking.detail?.cards;
    entries.push({
      ...view,
      rank: ranking.rank,
      isWinner: ranking.seat === result.winner,
      blitzes: detailNumber(ranking.detail, 'blitzes'),
      knockWins: detailNumber(ranking.detail, 'knockWins'),
      livesLeft: typeof livesRaw === 'number' && Number.isFinite(livesRaw) ? livesRaw : null,
      cardsLeft: typeof cardsRaw === 'number' && Number.isFinite(cardsRaw) ? cardsRaw : null,
    });
  }

  // Deterministic order: rank ascending, seat as tiebreak.
  entries.sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  return entries;
}
