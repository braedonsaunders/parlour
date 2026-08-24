/**
 * Web-facing contract (authoritative):
 *
 * Moves: `chooseTrump` {suit} (dealer only, when the flip turns a Wizard) ·
 *        `bid` {bid:0..handSize} (hook-forbidden values absent from legal moves) ·
 *        `playCard` {card}
 * State: stage (trumping/bidding/playing/over) · dealer · handSize · trumpCard ·
 *        trumpSuit · stock (masked in views) · hands (masked) · bids · turn ·
 *        leader · trick · tricksWon · tricksPlayed · played · summary
 * FX: card.fly ({card:'??', from:'stock', to, dur} — no face ids on the deal),
 *     card.flip (the trump), turn.ring, tricks.play, tricks.collect,
 *     ohhell.trump-turned, ohhell.trump-chosen, ohhell.bid, ohhell.bids-complete,
 *     ohhell.round-score, round.end; match fold emits ohhell.match-score
 * Presets: classic / quick / wizard
 */
export {
  GAME_ID,
  createOhHellDef,
  ohhellGame,
  phaseForState,
  OhHellFx,
  forbiddenBid,
  allowedBids,
  type OhHellPlayerView,
} from './game';
export { ohhellConfig, type OhHellRules, type HandArc, type ScoringScheme } from './config';
export type { OhHellState, OhHellStage, RoundSummary } from './state';
export { scoreBid, scoreRound, buildSummary, rankByScore, EXACT_BONUS } from './score';
export { dealCeiling, trumpCeiling, roundSchedule, planDeal } from './schedule';
export {
  STD_DECK,
  SUITS,
  MIN_SEATS,
  MAX_SEATS,
  deckSize,
  ohhellDeck,
  isWizard,
  isJester,
  suitOfCard,
  rankOfCard,
  orderOhHellHand,
  ohhellTrickRules,
  resolveOhHellWinner,
} from './cards';
export { ohhellHowToPlay } from './howto';
export { ohhellCatalog } from './catalog';
export { createOhHellMatchDef, OHHELL_GAME_ID, MATCH_ID, type OhHellMatchState } from './match';
export { TIER_BOTS, tierBot, makePolicy, profileForTier, type BotProfile } from './bots';
export { PERSONAS, makePersonaBot, personaById, type PersonaDef } from './bots/personas';
export { runBalanceGates, DEFAULT_THRESHOLDS, type GateReport } from './sim/gates';
