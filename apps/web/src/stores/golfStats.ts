import {
  createScoreStatsStore,
  type ScoredDailyResult,
  type ScoreStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const GOLF_STATS_STORAGE_KEY = 'parlour.golf.stats.v1';

export type GolfDailyResult = ScoredDailyResult;
export type GolfStatsState = ScoreStatsState;

export const useGolfStatsStore = createScoreStatsStore(GOLF_STATS_STORAGE_KEY);
