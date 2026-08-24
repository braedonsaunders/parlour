import { create } from 'zustand';
import type { SpadesModeId } from '@/lib/spades/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';

export type SpadesSetupState = {
  mode: SpadesModeId;
  botTier: BotTier;
  setMode: (mode: SpadesModeId) => void;
  setBotTier: (tier: number) => void;
};

/** Spades session setup — UI state only; rule values come from the pack presets. */
export const useSpadesSetupStore = create<SpadesSetupState>()((set) => ({
  mode: 'classic',
  botTier: 2,
  setMode: (mode) => set({ mode }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
