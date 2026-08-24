import { create } from 'zustand';
import type { EuchreModeId } from '@/lib/euchre/modes';

export type EuchreSetupState = {
  mode: EuchreModeId;
  setMode: (mode: EuchreModeId) => void;
};

/** Euchre session setup — UI state only; rule values come from the pack presets. */
export const useEuchreSetupStore = create<EuchreSetupState>()((set) => ({
  mode: 'classic',
  setMode: (mode) => set({ mode }),
}));
