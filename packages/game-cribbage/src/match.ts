import { type MatchDef, type MatchResult, type SeatId } from '@parlour/engine';
import type { CribbageConfig } from './config';
import { createCribbageDef, type CribbageDefOptions } from './rules';
import type { CribbageState } from './state';

/** Named Match Play preset: best of three races (first to two). */
export const GAMES_TO_WIN = 2;

export interface CribbageMatchState {
  wins: readonly number[];
  targetWins: number;
  lastGameReason: string | null;
  latestTotals: readonly number[];
}

function winnersOf(result: MatchResult): readonly SeatId[] {
  return result.rankings.filter((entry) => entry.rank === 1).map((entry) => entry.seat);
}

/**
 * Match play behind the config (brief): best-of-N complete races to 121. Each
 * round session is a full cribbage game, so a match replays as its game logs.
 * Dealer rotation inside each race is owned by the game itself.
 */
export function createCribbageMatchDef(
  options: CribbageDefOptions & { gamesToWin?: number } = {},
): MatchDef<CribbageState, CribbageConfig, CribbageMatchState> {
  const overrideGamesToWin = options.gamesToWin;
  if (
    overrideGamesToWin !== undefined &&
    (!Number.isInteger(overrideGamesToWin) || overrideGamesToWin < 1)
  ) {
    throw new Error('gamesToWin must be a positive integer');
  }
  return {
    id: 'cribbage-match',
    game: createCribbageDef(options),
    init: ({ config, seats }) => ({
      wins: Array.from({ length: seats }, () => 0),
      targetWins: overrideGamesToWin ?? config.gamesToWin,
      lastGameReason: null,
      latestTotals: Array.from({ length: seats }, () => 0),
    }),
    fold(match, result, ctx) {
      const winners = winnersOf(result);
      const wins = match.wins.map((count, seat) => (winners.includes(seat) ? count + 1 : count));
      for (const seat of winners) ctx.fx.emit('match.point', { seat, wins: wins[seat] });
      return {
        ...match,
        wins,
        lastGameReason: result.reason,
        latestTotals: [...ctx.finalState.totals],
      };
    },
    matchEnd(match) {
      if (!match.wins.some((wins) => wins >= match.targetWins)) return null;
      const ordered = match.wins
        .map((value, seat) => ({ seat, value }))
        .sort((a, b) => b.value - a.value || a.seat - b.seat);
      let priorValue: number | null = null;
      let priorRank = 0;
      const rankings = ordered.map(({ seat, value }, index) => {
        if (value !== priorValue) priorRank = index + 1;
        priorValue = value;
        return {
          seat,
          rank: priorRank,
          detail: { wins: value, total: match.latestTotals[seat] ?? 0 },
        };
      });
      const leader = ordered[0];
      return {
        winner: leader && leader.value > (ordered[1]?.value ?? -1) ? leader.seat : null,
        rankings,
        reason:
          match.targetWins === 1
            ? (match.lastGameReason ?? '121')
            : `best-of-${match.targetWins * 2 - 1}`,
      };
    },
  };
}
