export { makeEasyBot } from './easy';
export { chooseDiscard, makeMediumBot, scoreBuild } from './medium';
export { makeHardBot } from './hard';
export {
  buildOptions,
  discardOptions,
  keepScore,
  nearestNeedDistance,
  sourceOf,
  type BuildOption,
  type DiscardOption,
} from './evaluate';
export { EASY_PARAMS, HARD_PARAMS, MEDIUM_PARAMS, type BotParams } from './shared';
export {
  PERSONAS,
  makePersonaBot,
  personaById,
  spiteTierBot,
  SPITE_BOTS,
  type PersonaDef,
} from './personas';
