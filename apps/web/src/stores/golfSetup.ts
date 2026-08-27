import { isGolfModeId, makeGolfRun, type GolfModeId, type GolfRun } from '@/lib/golf/modes';
import { defineSolitaireSetup, type SolitaireSetup } from './setupFactories';

export const GOLF_SETUP_STORAGE_KEY = 'parlour.golf.setup.v1';

type GolfRunOptions = Parameters<typeof makeGolfRun>[1];

export type GolfSetupState = SolitaireSetup<GolfModeId, GolfRun, GolfRunOptions>;

/** Golf setup is UI-only. Rules remain owned by the game pack. */
export const useGolfSetupStore = defineSolitaireSetup<GolfModeId, GolfRun, GolfRunOptions>({
  gameId: 'golf',
  defaultMode: 'daily',
  isMode: isGolfModeId,
  makeRun: makeGolfRun,
});
