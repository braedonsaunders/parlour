import {
  createWinStatsStore,
  type SolitaireDailyResult,
  type WinStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const SPIDER_STATS_STORAGE_KEY = 'parlour.spider.stats.v1';

export type SpiderDailyResult = SolitaireDailyResult;
export type SpiderStatsState = WinStatsState;

export const useSpiderStatsStore = createWinStatsStore(SPIDER_STATS_STORAGE_KEY);
