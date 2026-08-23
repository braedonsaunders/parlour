// @parlour/game-blitz — 31/Scat family rules module (spec §5).
export {
  bestSuit,
  BLITZ_VALUE,
  handValue,
  hasThreeOfAKind,
  isBlitz,
  pipValue,
  suitOf,
  suitSums,
} from './hand';
export { blitzSeat, createBlitzDef, HAND_SIZE } from './rules';
export { matchResultOf, scoreRound } from './score';
export type { Pickup, RoundOutcome, RoundReason, BlitzState } from './state';
export { blitzConfigSchema } from './config';
export type { BlitzConfig } from './config';
export * from './bots';

/** canonical game id, mirrored for transport/session wiring */
export const GAME_ID = 'blitz';
