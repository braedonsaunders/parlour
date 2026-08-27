import { isEuchreModeId, type EuchreModeId } from '@/lib/euchre/modes';
import { defineModeSetup, type ModeSetup } from './setupFactories';

export const EUCHRE_SETUP_STORAGE_KEY = 'parlour.euchre.setup.v1';

export type EuchreSetupState = ModeSetup<EuchreModeId>;

/** Euchre session setup — UI state only; rule values come from the pack presets. */
export const useEuchreSetupStore = defineModeSetup<EuchreModeId>({
  gameId: 'euchre',
  defaultMode: 'classic',
  isMode: isEuchreModeId,
});
