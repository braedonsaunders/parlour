import {
  isFreecellModeId,
  makeFreecellRun,
  type FreecellModeId,
  type FreecellRun,
} from '@/lib/freecell/modes';
import { defineSolitaireSetup, type SolitaireSetup } from './setupFactories';

export const FREECELL_SETUP_STORAGE_KEY = 'parlour.freecell.setup.v1';

type FreecellRunOptions = Parameters<typeof makeFreecellRun>[1];

export type FreecellSetupState = SolitaireSetup<FreecellModeId, FreecellRun, FreecellRunOptions>;

/** Freecell setup is UI-only. Rules remain owned by the game pack. */
export const useFreecellSetupStore = defineSolitaireSetup<
  FreecellModeId,
  FreecellRun,
  FreecellRunOptions
>({
  gameId: 'freecell',
  defaultMode: 'daily',
  isMode: isFreecellModeId,
  makeRun: makeFreecellRun,
});
