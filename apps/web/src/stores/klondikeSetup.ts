import { create } from 'zustand';
import { makeKlondikeRun, type KlondikeModeId, type KlondikeRun } from '@/lib/klondike/modes';

export type KlondikeSetupState = {
  mode: KlondikeModeId;
  run: KlondikeRun | null;
  start: (mode: KlondikeModeId, options?: Parameters<typeof makeKlondikeRun>[1]) => KlondikeRun;
  replaceRun: (run: KlondikeRun) => void;
};

/** Klondike setup is UI-only. Rules remain owned by the game pack. */
export const useKlondikeSetupStore = create<KlondikeSetupState>((set) => ({
  mode: 'daily',
  run: null,
  start: (mode, options) => {
    const run = makeKlondikeRun(mode, options);
    set({ mode, run });
    return run;
  },
  replaceRun: (run) => set({ mode: run.mode, run }),
}));
