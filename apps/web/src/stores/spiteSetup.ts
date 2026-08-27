import { isSpiteModeId, type SpiteModeId } from '@/lib/spite/modes';
import { defineSeatedSetup, type SeatedSetup } from './setupFactories';

export const SPITE_SETUP_STORAGE_KEY = 'parlour.spite.setup.v1';

export const SPITE_SEAT_OPTIONS = [2, 3, 4] as const;

export type SpiteSetupState = SeatedSetup<SpiteModeId>;

export function clampSpiteSeats(seats: number): number {
  return SPITE_SEAT_OPTIONS.includes(seats as never) ? seats : 2;
}

export const useSpiteSetupStore = defineSeatedSetup<SpiteModeId>({
  gameId: 'spite',
  defaultMode: 'classic',
  isMode: isSpiteModeId,
  defaultSeats: 2,
  clampSeats: clampSpiteSeats,
});
