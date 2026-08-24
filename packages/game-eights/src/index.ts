export { GAME_ID, createEightsDef, matchEndResult } from './game';
export type { EightsDefOptions } from './game';
export {
  EIGHTS_SUITS,
  EIGHTS_SUIT_GLYPHS,
  EIGHTS_SUIT_NAMES,
  DRAW_TWO_RANK,
  REVERSE_RANK,
  SKIP_RANK,
  WILD_RANK,
  cardValue,
  eightsDeck,
  handValue,
  isEightsCard,
  isEightsSuit,
  isWild,
  orderEightsHand,
  rankOf,
  suitOf,
  type EightsSuit,
} from './cards';
export { eightsConfig, type EightsRules } from './config';
export {
  EIGHTS_MAX_SEATS,
  EIGHTS_MIN_SEATS,
  canDraw,
  canPlay,
  canStack,
  hasPlayable,
  playableCards,
  stockDry,
  topCard,
  type EightsPickupReason,
} from './round';
export type { EightsRound, EightsRoundOutcome, EightsRoundReason, EightsState } from './state';
export { EIGHTS_BOTS, eightsTierBot } from './bots';
export { eightsHowToPlay } from './howto';
export { eightsCatalog } from './catalog';
