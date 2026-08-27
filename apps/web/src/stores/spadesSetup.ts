import { isSpadesModeId, type SpadesModeId } from '@/lib/spades/modes';
import { createModeAndBotsStore, type ModeAndBotsState } from './setupFactories';

export const SPADES_SETUP_STORAGE_KEY = 'parlour.spades.setup.v1';

export type SpadesSetupState = ModeAndBotsState<SpadesModeId>;

/** Spades session setup — UI state only; rule values come from the pack presets. */
export const useSpadesSetupStore = createModeAndBotsStore<SpadesModeId>({
  storageKey: SPADES_SETUP_STORAGE_KEY,
  defaultMode: 'classic',
  isMode: isSpadesModeId,
});
