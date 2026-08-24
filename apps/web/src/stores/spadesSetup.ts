import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSpadesModeId, type SpadesModeId } from '@/lib/spades/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const SPADES_SETUP_STORAGE_KEY = 'parlour.spades.setup.v1';

export type SpadesSetupState = {
  mode: SpadesModeId;
  botTier: BotTier;
  setMode: (mode: SpadesModeId) => void;
  setBotTier: (tier: number) => void;
};

/** Spades session setup — UI state only; rule values come from the pack presets. */
export const useSpadesSetupStore = create<SpadesSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      setMode: (mode) => set({ mode }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
    }),
    setupPersistence<SpadesSetupState>(SPADES_SETUP_STORAGE_KEY, (stored) => ({
      mode: isSpadesModeId(stored.mode) ? stored.mode : 'classic',
      botTier: clampBotTier(Number(stored.botTier)),
    })),
  ),
);
