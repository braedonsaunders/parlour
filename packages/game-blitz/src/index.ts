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
export { blitzSeat, blitzVeil, createBlitzDef, dealBlitzRound, HAND_SIZE } from './rules';
export type { BlitzDealCtx } from './rules';
export { createBlitzMatchDef, matchEndResult as blitzMatchEndResult } from './matchGame';
export type { BlitzMatchDefOptions } from './matchGame';
export { blitzHowToPlay } from './howto';
export { blitzCatalog } from './catalog';
export {
  createBlitzLivesMatchDef,
  createBlitzTimedMatchDef,
  createBlitzWinsMatchDef,
  FIRST_TO_WINS,
  STARTING_LIVES,
  TIMED_DURATION_MS,
} from './match';
export type {
  BlitzLivesMatchState,
  BlitzTimedMatchState,
  BlitzTimedRoundState,
  BlitzWinsMatchState,
} from './match';
export { matchResultOf, scoreRound } from './score';
export type {
  BlitzMatchFormat,
  BlitzMatchState,
  BlitzSeatMetrics,
  BlitzState,
  Pickup,
  RoundOutcome,
  RoundReason,
} from './state';
export { blitzConfigSchema, outMaskFromLives, outSeatsFromMask } from './config';
export type { BlitzConfig } from './config';
export { isSittingOut, liveSeats, sittingOut } from './state';
export * from './bots';

/** canonical game id, mirrored for transport/session wiring */
export const GAME_ID = 'blitz';
