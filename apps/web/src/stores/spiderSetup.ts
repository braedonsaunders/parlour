import { makeSpiderRun, type SpiderModeId, type SpiderRun } from '@/lib/spider/modes';
import { createSolitaireSetupStore, type SolitaireRunState } from './setupFactories';

export const SPIDER_SETUP_STORAGE_KEY = 'parlour.spider.setup.v1';

export type SpiderSetupState = SolitaireRunState<SpiderModeId, SpiderRun>;

/** Spider setup is UI-only. Rules remain owned by the game pack. */
export const useSpiderSetupStore = createSolitaireSetupStore<SpiderModeId, SpiderRun>({
  storageKey: SPIDER_SETUP_STORAGE_KEY,
  defaultMode: 'daily',
  makeRun: makeSpiderRun,
});
