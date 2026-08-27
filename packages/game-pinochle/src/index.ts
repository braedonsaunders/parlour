/**
 * Web-facing contract (authoritative):
 * Moves: `bid` {bid:int} · `pass` (no payload) · `nameTrump` {suit:S|H|D|C} ·
 *        `confirmMeld` (no payload — meld is engine-computed from the hand,
 *        never player-supplied) · `playCard` {card}
 * State: scores/dealer/turn/highBid/highBidder/trump/melds/leader/trick/
 *        tricksBySeat/trickPointsBySeat/lastHand with teams[] breakdown
 * Team: seat % 2
 * FX: card.fly (…), turn.ring, tricks.play, tricks.collect,
 *     pinochle.bid, pinochle.auction-won, pinochle.redeal, pinochle.trump,
 *     pinochle.meld, pinochle.meld-complete, pinochle.trick-collect,
 *     pinochle.hand-score, pinochle.set, pinochle.score-chip, round.end
 * Presets: classic / quick / marathon
 */
export { GAME_ID } from './cards';
export {
  HAND_SIZE,
  PINOCHLE_SEATS,
  PINOCHLE_SUITS,
  PINOCHLE_SUIT_NAMES,
  TRICKS_PER_HAND,
  orderPinochleHand,
  partnerOf,
  pinochleDeck,
  pinochleTrickRules,
  pointsOf,
  rankOfCard,
  seatsOf,
  suitOfCard,
  teamOf,
  trickRankOf,
  type PinochleRank,
  type PinochleSuit,
} from './cards';
export {
  pinochleConfig,
  MAX_BID,
  MIN_BID_FLOOR,
  MIN_BID_CEILING,
  PINOCHLE_TARGET_OPTIONS,
  type PinochleRules,
} from './config';
export { computeMeld, EMPTY_MELD, type MeldBreakdown } from './meld';
export type {
  HandSummary,
  PinochleBid,
  PinochleStage,
  PinochleState,
  TeamHandScore,
} from './state';
export { scoreHand, matchOver, matchResult } from './score';
export {
  createPinochleDef,
  pinochleGame,
  phaseForState,
  PinochleFx,
  type PinochleDefOptions,
  type PinochlePlayerView,
} from './rules';
export { pinochleHowToPlay } from './howto';
export { pinochleCatalog } from './catalog';
export { TIER_BOTS, tierBot, chooseFromProfile, profileForTier, type BotProfile } from './bots';
export { PERSONAS, makePersonaBot, personaById, type PersonaDef } from './bots/personas';
export { runBalanceGates, DEFAULT_THRESHOLDS, type GateReport } from './sim/gates';
