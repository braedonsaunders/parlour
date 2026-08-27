import {
  isTripeaksModeId,
  makeTripeaksRun,
  type TripeaksModeId,
  type TripeaksRun,
} from '@/lib/tripeaks/modes';
import { defineSolitaireSetup, type SolitaireSetup } from './setupFactories';

export const TRIPEAKS_SETUP_STORAGE_KEY = 'parlour.tripeaks.setup.v1';

type TripeaksRunOptions = Parameters<typeof makeTripeaksRun>[1];

export type TripeaksSetupState = SolitaireSetup<TripeaksModeId, TripeaksRun, TripeaksRunOptions>;

/** TriPeaks setup is UI-only. Rules remain owned by the game pack. */
export const useTripeaksSetupStore = defineSolitaireSetup<
  TripeaksModeId,
  TripeaksRun,
  TripeaksRunOptions
>({
  gameId: 'tripeaks',
  defaultMode: 'daily',
  isMode: isTripeaksModeId,
  makeRun: makeTripeaksRun,
});
