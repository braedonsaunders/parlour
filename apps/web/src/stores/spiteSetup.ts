import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSpiteModeId, type SpiteModeId } from '@/lib/spite/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const SPITE_SETUP_STORAGE_KEY = 'parlour.spite.setup.v1';

export const SPITE_SEAT_OPTIONS = [2, 3, 4] as const;

export type SpiteSetupState = {
  mode: SpiteModeId;
  botTier: BotTier;
  seats: number;
  setMode: (mode: SpiteModeId) => void;
  setBotTier: (tier: number) => void;
  setSeats: (seats: number) => void;
};

export function clampSpiteSeats(seats: number): number {
  return SPITE_SEAT_OPTIONS.includes(seats as never) ? seats : 2;
}

export const useSpiteSetupStore = create<SpiteSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      seats: 2,
      setMode: (mode) => set({ mode }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setSeats: (seats) => set({ seats: clampSpiteSeats(seats) }),
    }),
    setupPersistence<SpiteSetupState>(SPITE_SETUP_STORAGE_KEY, (stored) => ({
      mode: isSpiteModeId(stored.mode) ? stored.mode : 'classic',
      seats: clampSpiteSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
    })),
  ),
);
