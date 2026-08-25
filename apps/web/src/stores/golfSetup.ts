import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeGolfRun, type GolfModeId, type GolfRun } from '@/lib/golf/modes';

export const GOLF_SETUP_STORAGE_KEY = 'parlour.golf.setup.v1';

export type GolfSetupState = {
  mode: GolfModeId;
  run: GolfRun | null;
  setMode: (mode: GolfModeId) => void;
  start: (mode: GolfModeId, options?: Parameters<typeof makeGolfRun>[1]) => GolfRun;
  replaceRun: (run: GolfRun) => void;
};

/** Golf setup is UI-only. Rules remain owned by the game pack. */
export const useGolfSetupStore = create<GolfSetupState>()(
  persist(
    (set) => ({
      mode: 'daily',
      run: null,
      setMode: (mode) => set({ mode }),
      start: (mode, options) => {
        const run = makeGolfRun(mode, options);
        set({ mode, run });
        return run;
      },
      replaceRun: (run) => set({ mode: run.mode, run }),
    }),
    {
      name: GOLF_SETUP_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
