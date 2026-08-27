import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

/**
 * The two setup stores that were written more than once.
 *
 * Of the eighteen setup stores, sixteen are genuinely different — seats,
 * rule overrides, difficulty, run state, all real per-game shape. Exactly two
 * shapes were copies: four solitaires keep a mode and a run, and two
 * trick-takers keep a mode and a bot tier. Those six files diffed to nothing
 * within their group once the game name was substituted out.
 *
 * Only those two are factored. Pulling the other twelve into a shared shape
 * would mean a default that is right for most games and quietly wrong for one,
 * which is a worse outcome than the copies were: a copy that is wrong is wrong
 * loudly, in its own file, where the game's own tests look.
 */

/** A solitaire run: mode plus whatever the pack needs to rebuild the deal. */
export type SolitaireRunState<Mode extends string, Run extends { mode: Mode }> = {
  mode: Mode;
  run: Run | null;
  setMode: (mode: Mode) => void;
  start: (mode: Mode, options?: unknown) => Run;
  replaceRun: (run: Run) => void;
};

export function createSolitaireSetupStore<
  Mode extends string,
  Run extends { mode: Mode },
>(options: {
  storageKey: string;
  defaultMode: Mode;
  makeRun: (mode: Mode, options?: never) => Run;
}): UseBoundStore<StoreApi<SolitaireRunState<Mode, Run>>> {
  return create<SolitaireRunState<Mode, Run>>()(
    persist(
      (set) => ({
        mode: options.defaultMode,
        run: null,
        setMode: (mode) => set({ mode }),
        start: (mode, runOptions) => {
          const run = options.makeRun(mode, runOptions as never);
          set({ mode, run });
          return run;
        },
        replaceRun: (run) => set({ mode: run.mode, run }),
      }),
      {
        name: options.storageKey,
        // The run itself is deliberately not persisted: a deal is a session,
        // and only the mode outlives it.
        partialize: (state) => ({ mode: state.mode }),
      },
    ),
  );
}

/** A seated game whose only setup is which preset and how hard the bots play. */
export type ModeAndBotsState<Mode extends string> = {
  mode: Mode;
  botTier: BotTier;
  setMode: (mode: Mode) => void;
  setBotTier: (tier: number) => void;
};

export function createModeAndBotsStore<Mode extends string>(options: {
  storageKey: string;
  defaultMode: Mode;
  isMode: (value: unknown) => value is Mode;
}): UseBoundStore<StoreApi<ModeAndBotsState<Mode>>> {
  return create<ModeAndBotsState<Mode>>()(
    persist(
      (set) => ({
        mode: options.defaultMode,
        botTier: 2,
        setMode: (mode) => set({ mode }),
        setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      }),
      setupPersistence<ModeAndBotsState<Mode>>(options.storageKey, (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
        botTier: clampBotTier(Number(stored.botTier)),
      })),
    ),
  );
}
