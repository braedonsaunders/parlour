import { create } from 'zustand';
import type { EuchreModeId } from '@/lib/euchre/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';

export type EuchreSetupState = {
  mode: EuchreModeId;
  botTier: BotTier;
  setMode: (mode: EuchreModeId) => void;
  setBotTier: (tier: number) => void;
};

/** Euchre session setup — UI state only; rule values come from the pack presets. */
export const useEuchreSetupStore = create<EuchreSetupState>()((set) => ({
  mode: 'classic',
  botTier: 2,
  setMode: (mode) => set({ mode }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
