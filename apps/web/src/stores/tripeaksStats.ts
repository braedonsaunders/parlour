import {
  createScoreStatsStore,
  type ScoredDailyResult,
  type ScoreStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const TRIPEAKS_STATS_STORAGE_KEY = 'parlour.tripeaks.stats.v1';

export type TripeaksDailyResult = ScoredDailyResult;
export type TripeaksStatsState = ScoreStatsState;

export const useTripeaksStatsStore = createScoreStatsStore(TRIPEAKS_STATS_STORAGE_KEY);
