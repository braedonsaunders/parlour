import {
  createScoreStatsStore,
  type ScoredDailyResult,
  type ScoreStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const PYRAMID_STATS_STORAGE_KEY = 'parlour.pyramid.stats.v1';

export type PyramidDailyResult = ScoredDailyResult;
export type PyramidStatsState = ScoreStatsState;

export const usePyramidStatsStore = createScoreStatsStore(PYRAMID_STATS_STORAGE_KEY);
