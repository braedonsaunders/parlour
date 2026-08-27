import { isSpadesModeId, type SpadesModeId } from '@/lib/spades/modes';
import { defineModeSetup, type ModeSetup } from './setupFactories';

export const SPADES_SETUP_STORAGE_KEY = 'parlour.spades.setup.v1';

export type SpadesSetupState = ModeSetup<SpadesModeId>;

/** Spades session setup — UI state only; rule values come from the pack presets. */
export const useSpadesSetupStore = defineModeSetup<SpadesModeId>({
  gameId: 'spades',
  defaultMode: 'classic',
  isMode: isSpadesModeId,
});
