/**
 * Web-facing contract (authoritative):
 *
 * Moves: `playCard` {card, take?: CardId[]} — take omitted for a pose; a
 *        single-card match forces a capture (poses and sums are then illegal).
 * State: scores per owner (team at 4/6 seats) / turn / dealer / table /
 *        hands / stock / captures per seat / scope per seat / lastCapturer /
 *        summary + lastRound (awards[] breakdown)
 * Team:  seats % 2 at 4 and 6 seats; individuals otherwise
 * FX:    card.fly ({card:'??', from, to, dur} on every deal),
 *        card.flip (opening tableau), turn.ring, round.end,
 *        scopa.pose, scopa.capture ({seat, card, take, count}),
 *        scopa.scopa, scopa.sweep, scopa.award, scopa.round-score
 * Presets: classic / lungo / scopone-preset
 */
export {
  GAME_ID,
  createScopaDef,
  scopaGame,
  phaseForState,
  ScopaFx,
  type ScopaPlayerView,
  type ScopaDefOptions,
} from './game';
export { scopaConfig, TARGET_OPTIONS, type ScopaRules } from './config';
export type { ScopaState, ScopaStage, Award, AwardKind, RoundSummary } from './state';
export { AWARD_KINDS } from './state';
export {
  scoreRound,
  matchOver,
  matchResultFor,
  napolaRun,
  primieraTotal,
  primieraValue,
  type OwnerRoundScore,
  type RoundScore,
  type RoundScoreInput,
} from './score';
export {
  DECK,
  DECK_ITALIANO,
  deckForDisplay,
  DECK_SIZE,
  TABLE_SIZE,
  DEAL_PER_TURN,
  GAME_SEATS,
  PARTNERSHIP_SEATS,
  SUITS,
  SUIT_DENARI,
  SUIT_COPPE,
  SUIT_SPADE,
  SUIT_BASTONI,
  captureValue,
  suitOfCard,
  isDenari,
  isSettebello,
  isReDenari,
  countKings,
  dealLayout,
  orderScopaHand,
  ownerOf,
  ownerCount,
  seatsOfOwner,
  playsInTeams,
} from './cards';
export { captureOptions, singleMatches, sumCombinations, takeableValues } from './capture';
export { scopaHowToPlay } from './howto';
export { scopaCatalog } from './catalog';
export {
  TIER_BOTS,
  tierBot,
  makePolicy,
  chooseFromProfile,
  profileForTier,
  decidePlay,
  rankPlays,
  unseenValueCounts,
  HARD_PARAMS,
  MEDIUM_PARAMS,
  type BotProfile,
  type PlayParams,
} from './bots';
export { PERSONAS, makePersonaBot, personaById, type PersonaDef } from './bots/personas';
export { runBalanceGates, runCoverage, DEFAULT_THRESHOLDS, type GateReport } from './sim/gates';
