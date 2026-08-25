import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeSpiderRun, type SpiderModeId, type SpiderRun } from '@/lib/spider/modes';

export const SPIDER_SETUP_STORAGE_KEY = 'parlour.spider.setup.v1';

export type SpiderSetupState = {
  mode: SpiderModeId;
  run: SpiderRun | null;
  setMode: (mode: SpiderModeId) => void;
  start: (mode: SpiderModeId, options?: Parameters<typeof makeSpiderRun>[1]) => SpiderRun;
  replaceRun: (run: SpiderRun) => void;
};

/** Spider setup is UI-only. Rules remain owned by the game pack. */
export const useSpiderSetupStore = create<SpiderSetupState>()(
  persist(
    (set) => ({
      mode: 'daily',
      run: null,
      setMode: (mode) => set({ mode }),
      start: (mode, options) => {
        const run = makeSpiderRun(mode, options);
        set({ mode, run });
        return run;
      },
      replaceRun: (run) => set({ mode: run.mode, run }),
    }),
    {
      name: SPIDER_SETUP_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
