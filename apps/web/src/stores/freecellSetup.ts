import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeFreecellRun, type FreecellModeId, type FreecellRun } from '@/lib/freecell/modes';

export const FREECELL_SETUP_STORAGE_KEY = 'parlour.freecell.setup.v1';

export type FreecellSetupState = {
  mode: FreecellModeId;
  run: FreecellRun | null;
  setMode: (mode: FreecellModeId) => void;
  start: (mode: FreecellModeId, options?: Parameters<typeof makeFreecellRun>[1]) => FreecellRun;
  replaceRun: (run: FreecellRun) => void;
};

/** FreeCell setup is UI-only. Rules remain owned by the game pack. */
export const useFreecellSetupStore = create<FreecellSetupState>()(
  persist(
    (set) => ({
      mode: 'daily',
      run: null,
      setMode: (mode) => set({ mode }),
      start: (mode, options) => {
        const run = makeFreecellRun(mode, options);
        set({ mode, run });
        return run;
      },
      replaceRun: (run) => set({ mode: run.mode, run }),
    }),
    {
      name: FREECELL_SETUP_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
