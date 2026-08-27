import { MAX_SEATS, MIN_SEATS } from '@parlour/game-poker';
import { isPokerModeId, type PokerModeId } from '@/lib/poker/modes';
import { defineSeatedSetup, type SeatedSetup } from './setupFactories';

export const POKER_SETUP_STORAGE_KEY = 'parlour.poker.setup.v1';

export type PokerSetupState = SeatedSetup<PokerModeId>;

export function clampPokerSeats(seats: number): number {
  if (!Number.isFinite(seats)) return 4;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(seats)));
}

/** Poker session setup — UI state only; rule values come from the pack presets. */
export const usePokerSetupStore = defineSeatedSetup<PokerModeId>({
  gameId: 'poker',
  defaultMode: 'classic',
  isMode: isPokerModeId,
  defaultSeats: 4,
  clampSeats: clampPokerSeats,
});
