/**
 * Web-facing contract (authoritative):
 *
 * Moves: `bid` {bid:1..13} · `bidNil` (no payload, only if nil) · `playCard` {card}
 * State: scores/bags/dealer/turn/leader/bids/trick/tricksBySeat/spadesBroken/
 *        lastHand (and lastHandSummary alias) with teams[] breakdown
 * Team: seat % 2
 * FX: card.fly, turn.ring, tricks.play, tricks.collect,
 *     spades.bid, spades.bids-complete, spades.trick-collect, spades.spades-broken,
 *     spades.nil-made, spades.nil-failed, spades.hand-score, spades.bag-penalty,
 *     spades.score-chip, round.end
 * Presets: classic / quick / clean-books
 */
export {
  GAME_ID,
  createSpadesDef,
  spadesGame,
  phaseForState,
  SpadesFx,
  type SpadesPlayerView,
} from './game';
export { spadesConfig, BAG_LIMIT, BAG_PENALTY, NIL_SCORE, type SpadesRules } from './config';
export type { SpadesState, SpadesStage, SpadesBid, HandSummary, TeamHandScore } from './state';
export {
  scoreHand,
  scoreTeam,
  matchOver,
  matchResult,
  teamContract,
  teamNonNilTricks,
  teamNilTricks,
} from './score';
export {
  DECK,
  HAND_SIZE,
  SPADES_SEATS,
  TRICKS_PER_HAND,
  orderSpadesHand,
  rankOfCard,
  suitOfCard,
  isSpade,
  spadesTrickRules,
  teamOf,
  partnerOf,
  seatsOf,
} from './cards';
export { spadesHowToPlay } from './howto';
export { spadesCatalog } from './catalog';
export { auditFollowSuit, reconstructHands } from './audit';
export {
  TIER_BOTS,
  tierBot,
  makePolicy,
  chooseFromProfile,
  profileForTier,
  type BotProfile,
} from './bots';
export { PERSONAS, makePersonaBot, personaById, type PersonaDef } from './bots/personas';
export { runBalanceGates, DEFAULT_THRESHOLDS, type GateReport } from './sim/gates';
