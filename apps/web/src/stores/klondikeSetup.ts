import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dealKlondikeRun, type KlondikeModeId, type KlondikeRun } from '@/lib/klondike/modes';

export const KLONDIKE_SETUP_STORAGE_KEY = 'parlour.klondike.setup.v1';

export type KlondikeSetupState = {
  mode: KlondikeModeId;
  /**
   * On by default. Klondike deals about one dead table in five, and a shared
   * daily one nobody can clear is a worse experience than a slightly narrowed
   * shuffle. Players who want the honest odds can turn it off.
   */
  winnableOnly: boolean;
  run: KlondikeRun | null;
  setMode: (mode: KlondikeModeId) => void;
  setWinnableOnly: (winnableOnly: boolean) => void;
  start: (
    mode: KlondikeModeId,
    options?: Omit<Parameters<typeof dealKlondikeRun>[1], 'winnableOnly'>,
  ) => Promise<KlondikeRun>;
  replaceRun: (run: KlondikeRun) => void;
};

/** Klondike setup is UI-only. Rules remain owned by the game pack. */
export const useKlondikeSetupStore = create<KlondikeSetupState>()(
  persist(
    (set, get) => ({
      mode: 'daily',
      winnableOnly: true,
      run: null,
      setMode: (mode) => set({ mode }),
      setWinnableOnly: (winnableOnly) => set({ winnableOnly }),
      start: async (mode, options) => {
        const run = await dealKlondikeRun(mode, {
          ...options,
          winnableOnly: get().winnableOnly,
        });
        set({ mode, run });
        return run;
      },
      replaceRun: (run) => set({ mode: run.mode, run }),
    }),
    {
      name: KLONDIKE_SETUP_STORAGE_KEY,
      // The run itself is per-sitting; only the preferences are worth keeping.
      partialize: (state) => ({ mode: state.mode, winnableOnly: state.winnableOnly }),
    },
  ),
);
