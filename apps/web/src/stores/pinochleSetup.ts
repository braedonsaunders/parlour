import { isPinochleModeId, type PinochleModeId } from '@/lib/pinochle/modes';
import { defineModeSetup, type ModeSetup } from './setupFactories';

export const PINOCHLE_SETUP_STORAGE_KEY = 'parlour.pinochle.setup.v1';

export type PinochleSetupState = ModeSetup<PinochleModeId>;

/** Pinochle session setup — UI state only; rule values come from the pack presets. */
export const usePinochleSetupStore = defineModeSetup<PinochleModeId>({
  gameId: 'pinochle',
  defaultMode: 'classic',
  isMode: isPinochleModeId,
});
