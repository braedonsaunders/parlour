import {
  createWinStatsStore,
  type SolitaireDailyResult,
  type WinStatsState,
} from './solitaireStats';

export { dailyResultFor, dailyStreak } from './solitaireStats';

export const KLONDIKE_STATS_STORAGE_KEY = 'parlour.klondike.stats.v1';

export type KlondikeDailyResult = SolitaireDailyResult;
export type KlondikeStatsState = WinStatsState;

export const useKlondikeStatsStore = createWinStatsStore(KLONDIKE_STATS_STORAGE_KEY);
