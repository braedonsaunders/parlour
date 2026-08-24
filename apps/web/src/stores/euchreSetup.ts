import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isEuchreModeId, type EuchreModeId } from '@/lib/euchre/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const EUCHRE_SETUP_STORAGE_KEY = 'parlour.euchre.setup.v1';

export type EuchreSetupState = {
  mode: EuchreModeId;
  botTier: BotTier;
  setMode: (mode: EuchreModeId) => void;
  setBotTier: (tier: number) => void;
};

/** Euchre session setup — UI state only; rule values come from the pack presets. */
export const useEuchreSetupStore = create<EuchreSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      setMode: (mode) => set({ mode }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
    }),
    setupPersistence<EuchreSetupState>(EUCHRE_SETUP_STORAGE_KEY, (stored) => ({
      mode: isEuchreModeId(stored.mode) ? stored.mode : 'classic',
      botTier: clampBotTier(Number(stored.botTier)),
    })),
  ),
);
