import { create } from 'zustand';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import type { OhHellModeId } from '@/lib/ohhell/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';

export type OhHellSetupState = {
  mode: OhHellModeId;
  seats: number;
  botTier: BotTier;
  setMode: (mode: OhHellModeId) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
};

/** Clamps to the ring the pack actually deals — 3 to 7. */
export function clampOhHellSeats(seats: number): number {
  if (!Number.isInteger(seats)) return 4;
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, seats));
}

/** Oh Hell session setup — UI state only; rule values come from pack presets. */
export const useOhHellSetupStore = create<OhHellSetupState>()((set) => ({
  mode: 'classic',
  seats: 4,
  botTier: 2,
  setMode: (mode) => set({ mode }),
  setSeats: (seats) => set({ seats: clampOhHellSeats(seats) }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
