import { dealKlondikeRun, type KlondikeModeId, type KlondikeRun } from '@/lib/klondike/modes';
import { defineSetup } from '@/stores/gameSetup';

export const KLONDIKE_SETUP_STORAGE_KEY = 'parlour.klondike.setup.v1';

const MODES: readonly KlondikeModeId[] = ['daily', 'classic', 'relaxed'];

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

/**
 * Defined against the primitive rather than `defineSolitaireSetup`: Klondike
 * keeps a winnable-only preference the other three solitaires do not have, and
 * its deal is asynchronous because the solver has to prove the board first.
 */
export const useKlondikeSetupStore = defineSetup<
  { mode: KlondikeModeId; winnableOnly: boolean },
  Pick<KlondikeSetupState, 'setMode' | 'setWinnableOnly' | 'start' | 'replaceRun'>,
  KlondikeRun
>(
  'klondike',
  {
    defaults: { mode: 'daily', winnableOnly: true },
    coerce: (stored) => ({
      mode: MODES.includes(stored.mode as KlondikeModeId)
        ? (stored.mode as KlondikeModeId)
        : 'daily',
      winnableOnly: stored.winnableOnly !== false,
    }),
  },
  (setup) => ({
    setMode: (mode) => setup.patch({ mode }),
    setWinnableOnly: (winnableOnly) => setup.patch({ winnableOnly }),
    start: async (mode, options) => {
      const run = await dealKlondikeRun(mode, {
        ...options,
        winnableOnly: setup.get().winnableOnly,
      });
      setup.patch({ mode });
      setup.putRun(run);
      return run;
    },
    replaceRun: (run) => {
      setup.patch({ mode: run.mode });
      setup.putRun(run);
    },
  }),
);
