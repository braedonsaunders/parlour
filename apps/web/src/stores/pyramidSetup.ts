import { makePyramidRun, type PyramidModeId, type PyramidRun } from '@/lib/pyramid/modes';
import { createSolitaireSetupStore, type SolitaireRunState } from './setupFactories';

export const PYRAMID_SETUP_STORAGE_KEY = 'parlour.pyramid.setup.v1';

export type PyramidSetupState = SolitaireRunState<PyramidModeId, PyramidRun>;

/** Pyramid setup is UI-only. Rules remain owned by the game pack. */
export const usePyramidSetupStore = createSolitaireSetupStore<PyramidModeId, PyramidRun>({
  storageKey: PYRAMID_SETUP_STORAGE_KEY,
  defaultMode: 'daily',
  makeRun: makePyramidRun,
});
