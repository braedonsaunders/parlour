import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-poker';
import { isPokerModeId, type PokerModeId } from '@/lib/poker/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const POKER_SETUP_STORAGE_KEY = 'parlour.poker.setup.v1';

export type PokerSetupState = {
  mode: PokerModeId;
  botTier: BotTier;
  seats: number;
  setMode: (mode: PokerModeId) => void;
  setBotTier: (tier: number) => void;
  setSeats: (seats: number) => void;
};

export function clampPokerSeats(seats: number): number {
  if (!Number.isFinite(seats)) return 4;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(seats)));
}

/** Poker session setup — UI state only; rule values come from the pack presets. */
export const usePokerSetupStore = create<PokerSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      seats: 4,
      setMode: (mode) => set({ mode }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setSeats: (seats) => set({ seats: clampPokerSeats(seats) }),
    }),
    setupPersistence<PokerSetupState>(POKER_SETUP_STORAGE_KEY, (stored) => ({
      mode: isPokerModeId(stored.mode) ? stored.mode : 'classic',
      seats: clampPokerSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
    })),
  ),
);
