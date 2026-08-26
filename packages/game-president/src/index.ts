export {
  PresidentFx,
  GAME_ID,
  MAX_SEATS,
  MIN_SEATS,
  createPresidentDef,
  presidentGame,
  activeSeats,
  giftCountFor,
  matchOver,
  matchResult,
  phaseFor,
  pointsForFinish,
  roleFor,
} from './game';
export { presidentHowToPlay } from './howto';
export { presidentCatalog } from './catalog';
export {
  easyPresidentBot,
  hardPresidentBot,
  mediumPresidentBot,
  presidentBots,
  presidentTierBot,
} from './bots/index';
export type { ExchangeMove, PresidentRole, PresidentState, StandingSet } from './state';
export { PRESIDENT_DECK, MAX_SET_SIZE, MIN_SET_SIZE, TWO_ORDER, orderOf } from './deck';
export { DEFAULT_TARGET_POINTS, presidentConfig, type PresidentRules } from './config';
