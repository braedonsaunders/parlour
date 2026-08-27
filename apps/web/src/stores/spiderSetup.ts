import {
  isSpiderModeId,
  makeSpiderRun,
  type SpiderModeId,
  type SpiderRun,
} from '@/lib/spider/modes';
import { defineSolitaireSetup, type SolitaireSetup } from './setupFactories';

export const SPIDER_SETUP_STORAGE_KEY = 'parlour.spider.setup.v1';

type SpiderRunOptions = Parameters<typeof makeSpiderRun>[1];

export type SpiderSetupState = SolitaireSetup<SpiderModeId, SpiderRun, SpiderRunOptions>;

/** Spider setup is UI-only. Rules remain owned by the game pack. */
export const useSpiderSetupStore = defineSolitaireSetup<SpiderModeId, SpiderRun, SpiderRunOptions>({
  gameId: 'spider',
  defaultMode: 'daily',
  isMode: isSpiderModeId,
  makeRun: makeSpiderRun,
});
