import { isEuchreModeId, type EuchreModeId } from '@/lib/euchre/modes';
import { createModeAndBotsStore, type ModeAndBotsState } from './setupFactories';

export const EUCHRE_SETUP_STORAGE_KEY = 'parlour.euchre.setup.v1';

export type EuchreSetupState = ModeAndBotsState<EuchreModeId>;

/** Euchre session setup — UI state only; rule values come from the pack presets. */
export const useEuchreSetupStore = createModeAndBotsStore<EuchreModeId>({
  storageKey: EUCHRE_SETUP_STORAGE_KEY,
  defaultMode: 'classic',
  isMode: isEuchreModeId,
});
