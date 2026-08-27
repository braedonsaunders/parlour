import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import { isOhHellModeId, type OhHellModeId } from '@/lib/ohhell/modes';
import { defineSeatedSetup, type SeatedSetup } from './setupFactories';

export const OHHELL_SETUP_STORAGE_KEY = 'parlour.ohhell.setup.v1';

export type OhHellSetupState = SeatedSetup<OhHellModeId>;

export function clampOhHellSeats(seats: number): number {
  if (!Number.isFinite(seats)) return 4;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(seats)));
}

/** Oh Hell session setup — UI state only; rule values come from the pack presets. */
export const useOhHellSetupStore = defineSeatedSetup<OhHellModeId>({
  gameId: 'ohhell',
  defaultMode: 'classic',
  isMode: isOhHellModeId,
  defaultSeats: 4,
  clampSeats: clampOhHellSeats,
});
