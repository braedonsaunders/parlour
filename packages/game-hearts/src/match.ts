import type { MatchDef, MatchResult } from '@parlour/engine';
import {
  HEARTS_GAME_OVER_OPTIONS,
  heartsConfigSchema,
  passDirectionFor,
  type HeartsRules,
} from './config';
import { heartsGame } from './game';
import type { HeartsState } from './state';

/**
 * A Hearts match stacks hands: every fold adds the hand's adjusted points to
 * each seat's cumulative total, pass direction rotates per hand, and the match
 * ends when anyone crosses the game-over line — lowest total wins.
 *
 * The whole match replays from (seed, config, seats, roundLogs).
 */
export interface HeartsMatchState {
  scores: readonly number[];
  /** resolved from config at init; carried so matchEnd stays pure */
  gameOverAt: number;
}

function lowestWinsRanking(scores: readonly number[], reason: string): MatchResult {
  const ordered = scores
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => a.value - b.value || a.seat - b.seat);
  let priorValue: number | null = null;
  let priorRank = 0;
  const rankings = ordered.map(({ seat, value }, index) => {
    if (value !== priorValue) priorRank = index + 1;
    priorValue = value;
    return { seat, rank: priorRank, detail: { points: value } };
  });
  const winner = rankings.length > 0 && rankings[0]!.rank === 1 ? rankings[0]!.seat : null;
  return { winner, rankings, reason };
}

function resolveThreshold(value: unknown): number {
  const numeric = Number(value);
  if (HEARTS_GAME_OVER_OPTIONS.includes(numeric as (typeof HEARTS_GAME_OVER_OPTIONS)[number])) {
    return numeric;
  }
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 100;
}

export function createHeartsMatchDef(): MatchDef<HeartsState, HeartsRules, HeartsMatchState> {
  return {
    id: 'hearts-match',
    game: heartsGame,
    init: ({ config, seats }) => ({
      scores: Array.from({ length: seats }, () => 0),
      gameOverAt: resolveThreshold((config as HeartsRules).gameOver),
    }),
    fold(match, result: MatchResult, ctx) {
      const scores = match.scores.slice();
      for (const entry of result.rankings) {
        const points = entry.detail?.points;
        if (typeof points !== 'number') continue;
        scores[entry.seat] = (scores[entry.seat] ?? 0) + points;
        ctx.fx.emit('hearts.score', {
          seat: entry.seat,
          hand: points,
          total: scores[entry.seat],
        });
      }
      return { ...match, scores };
    },
    matchEnd(match) {
      if (!match.scores.some((score) => score >= match.gameOverAt)) return null;
      return lowestWinsRanking(match.scores, 'game-over');
    },
    roundConfig(_match, roundIndex, base): HeartsRules {
      // Rotation wins in matches; a lone room hand uses its configured direction.
      // The match wrapper resolves the result against the schema.
      return { ...base, passDirection: passDirectionFor(roundIndex, base.holdHand) };
    },
  };
}

/** Convenience for callers that want a preset-resolved starting config. */
export function heartsMatchConfig(values: Partial<HeartsRules> = {}): HeartsRules {
  return heartsConfigSchema.resolve(values);
}
