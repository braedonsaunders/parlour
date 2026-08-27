import { makeGolfRun, type GolfModeId, type GolfRun } from '@/lib/golf/modes';
import { createSolitaireSetupStore, type SolitaireRunState } from './setupFactories';

export const GOLF_SETUP_STORAGE_KEY = 'parlour.golf.setup.v1';

export type GolfSetupState = SolitaireRunState<GolfModeId, GolfRun>;

/** Golf setup is UI-only. Rules remain owned by the game pack. */
export const useGolfSetupStore = createSolitaireSetupStore<GolfModeId, GolfRun>({
  storageKey: GOLF_SETUP_STORAGE_KEY,
  defaultMode: 'daily',
  makeRun: makeGolfRun,
});
