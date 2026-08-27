import {
  isPyramidModeId,
  makePyramidRun,
  type PyramidModeId,
  type PyramidRun,
} from '@/lib/pyramid/modes';
import { defineSolitaireSetup, type SolitaireSetup } from './setupFactories';

export const PYRAMID_SETUP_STORAGE_KEY = 'parlour.pyramid.setup.v1';

type PyramidRunOptions = Parameters<typeof makePyramidRun>[1];

export type PyramidSetupState = SolitaireSetup<PyramidModeId, PyramidRun, PyramidRunOptions>;

/** Pyramid setup is UI-only. Rules remain owned by the game pack. */
export const usePyramidSetupStore = defineSolitaireSetup<
  PyramidModeId,
  PyramidRun,
  PyramidRunOptions
>({
  gameId: 'pyramid',
  defaultMode: 'daily',
  isMode: isPyramidModeId,
  makeRun: makePyramidRun,
});
