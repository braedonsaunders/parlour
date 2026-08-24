// @parlour/game-gin — Gin Rummy rules module (2 seats, 52-card deck).
export const GAME_ID = 'gin';

export {
  DEAD_STOCK_SIZE,
  DEAL_STAGGER_MS,
  GIN_HAND_SIZE,
  createGinHandDef,
  dealHand,
  ginVeil,
} from './rules';
export { createGinMatchDef, matchEndResult } from './matchGame';
export type { GinMatchDefOptions } from './matchGame';
export { bestPartition, candidateMelds, deadwoodOf, findLayoffs } from './melds';
export type { GinMeld, GinPartition, Layoff } from './melds';
export { pipValue, rankOf, suitOf } from './cards';
export {
  BOX_BONUS_POINTS,
  DEFAULT_BIG_GIN_BONUS,
  DEFAULT_GIN_BONUS,
  DEFAULT_KNOCK_CAP,
  DEFAULT_MATCH_TARGET,
  UNDERCUT_BONUS_POINTS,
  ginConfigSchema,
} from './config';
export type { GinConfig } from './config';
export { scoreHand, HAND_SIZE } from './score';
export type {
  HandOutcome,
  GinState,
  GinMatchState,
  HandReason,
  LayoffRecord,
  Pickup,
} from './state';
export { ginHowToPlay } from './howto';
export * from './bots';
