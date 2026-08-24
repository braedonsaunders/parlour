import { create } from 'zustand';
import type { SpiteModeId } from '@/lib/spite/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';

export type SpiteSetupState = {
  mode: SpiteModeId;
  seats: number;
  botTier: BotTier;
  setMode: (mode: SpiteModeId) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
};

/** Two to four; the pack's setup throws outside that ring. */
export function clampSpiteSeats(seats: number): number {
  if (!Number.isInteger(seats)) return 2;
  return Math.min(4, Math.max(2, seats));
}

/** Spite session setup — UI state only; rule values come from pack presets. */
export const useSpiteSetupStore = create<SpiteSetupState>()((set) => ({
  mode: 'classic',
  seats: 2,
  botTier: 2,
  setMode: (mode) => set({ mode }),
  setSeats: (seats) => set({ seats: clampSpiteSeats(seats) }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
