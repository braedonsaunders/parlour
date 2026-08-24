import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import { isOhHellModeId, type OhHellModeId } from '@/lib/ohhell/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const OHHELL_SETUP_STORAGE_KEY = 'parlour.ohhell.setup.v1';

export type OhHellSetupState = {
  mode: OhHellModeId;
  botTier: BotTier;
  seats: number;
  setMode: (mode: OhHellModeId) => void;
  setBotTier: (tier: number) => void;
  setSeats: (seats: number) => void;
};

export function clampOhHellSeats(seats: number): number {
  if (!Number.isFinite(seats)) return 4;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(seats)));
}

/** Oh Hell session setup — UI state only; rule values come from the pack presets. */
export const useOhHellSetupStore = create<OhHellSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      seats: 4,
      setMode: (mode) => set({ mode }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setSeats: (seats) => set({ seats: clampOhHellSeats(seats) }),
    }),
    setupPersistence<OhHellSetupState>(OHHELL_SETUP_STORAGE_KEY, (stored) => ({
      mode: isOhHellModeId(stored.mode) ? stored.mode : 'classic',
      seats: clampOhHellSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
    })),
  ),
);
