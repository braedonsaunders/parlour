import { makeFreecellRun, type FreecellModeId, type FreecellRun } from '@/lib/freecell/modes';
import { createSolitaireSetupStore, type SolitaireRunState } from './setupFactories';

export const FREECELL_SETUP_STORAGE_KEY = 'parlour.freecell.setup.v1';

export type FreecellSetupState = SolitaireRunState<FreecellModeId, FreecellRun>;

/** Freecell setup is UI-only. Rules remain owned by the game pack. */
export const useFreecellSetupStore = createSolitaireSetupStore<FreecellModeId, FreecellRun>({
  storageKey: FREECELL_SETUP_STORAGE_KEY,
  defaultMode: 'daily',
  makeRun: makeFreecellRun,
});
