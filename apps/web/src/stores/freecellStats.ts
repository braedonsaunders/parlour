import {
  createWinStatsStore,
  type SolitaireDailyResult,
  type WinStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const FREECELL_STATS_STORAGE_KEY = 'parlour.freecell.stats.v1';

export type FreecellDailyResult = SolitaireDailyResult;
export type FreecellStatsState = WinStatsState;

export const useFreecellStatsStore = createWinStatsStore(FREECELL_STATS_STORAGE_KEY);
