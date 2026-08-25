import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makePyramidRun, type PyramidModeId, type PyramidRun } from '@/lib/pyramid/modes';

export const PYRAMID_SETUP_STORAGE_KEY = 'parlour.pyramid.setup.v1';

export type PyramidSetupState = {
  mode: PyramidModeId;
  run: PyramidRun | null;
  setMode: (mode: PyramidModeId) => void;
  start: (mode: PyramidModeId, options?: Parameters<typeof makePyramidRun>[1]) => PyramidRun;
  replaceRun: (run: PyramidRun) => void;
};

/** Pyramid setup is UI-only. Rules remain owned by the game pack. */
export const usePyramidSetupStore = create<PyramidSetupState>()(
  persist(
    (set) => ({
      mode: 'daily',
      run: null,
      setMode: (mode) => set({ mode }),
      start: (mode, options) => {
        const run = makePyramidRun(mode, options);
        set({ mode, run });
        return run;
      },
      replaceRun: (run) => set({ mode: run.mode, run }),
    }),
    {
      name: PYRAMID_SETUP_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
