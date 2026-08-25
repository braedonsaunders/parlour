/**
 * Web-facing contract (authoritative):
 *
 * Moves: `fold` · `check` · `call` · `bet` {to} · `raise` {to}
 *        (`to` is the total this seat's bet reaches, not the chips added —
 *         any whole number from the minimum raise up to all-in is legal;
 *         `flow.legalMoves` offers a ladder for bots and quick buttons)
 * System moves: `dealStreet` · `settle` · `nextHand` — all automatic
 * State: stacks/committed/streetBet/currentBet/pot, board, street, button,
 *        blinds by `level`, out/bustOrder, lastHand summary with pots+awards
 * FX: card.fly ({card:'??'} for hole cards, real ids for the board),
 *     turn.ring, showdown.reveal, round.end,
 *     poker.blind, poker.ante, poker.action, poker.street, poker.pot-collect,
 *     poker.showdown, poker.muck, poker.award, poker.bust, poker.button,
 *     poker.blinds-up
 * Presets: classic / turbo / deep
 *
 * Veil: hole cards are dealt face down and opened privately by whoever holds
 * them. What makes hold'em different from every other veiled game here is that
 * it keeps turning cards *during* the hand — three on the flop, one on the
 * turn, one on the river, each public the moment it lands and not before — so
 * the pack names those cards through `veil.publicOpens` and the room peels
 * exactly those in public. A showdown is the same mechanism pointed at the
 * hole cards of everyone still contesting the pot; a pot everyone folded out
 * of is a walkover and those hands are never opened, so mucking survives.
 */
export {
  GAME_ID,
  createPokerDef,
  pokerPublicOpens,
  pokerGame,
  phaseForState,
  PokerFx,
  type PokerDefOptions,
  type PokerPlayerView,
} from './game';
export {
  pokerConfig,
  blindsForLevel,
  anteForLevel,
  handsPerLevel,
  BLIND_LEVELS,
  ANTE_FROM_LEVEL,
  type PokerRules,
  type BlindLevel,
} from './config';
export {
  actingSeats,
  contestingSeats,
  livingSeats,
  potSoFar,
  toCall,
  type ActionKind,
  type ActionRecord,
  type HandSummary,
  type PokerState,
  type ShownHand,
  type Street,
} from './state';
export {
  Category,
  compareHands,
  handLabel,
  rankHand,
  type CategoryId,
  type HandRank,
} from './evaluate';
export {
  awardPots,
  awardUncontested,
  buildPots,
  potTotal,
  type PotAward,
  type SidePot,
} from './pot';
export {
  allInTo,
  bettingClosed,
  bettingPossible,
  bigBlindSeat,
  canRaise,
  firstToActPostflop,
  firstToActPreflop,
  isHeadsUp,
  minRaiseTo,
  nextActor,
  nextLiving,
  potRaiseTo,
  raiseLadder,
  smallBlindSeat,
} from './betting';
export {
  DECK,
  HOLE_CARDS,
  BOARD_CARDS,
  MIN_SEATS,
  MAX_SEATS,
  byRankDesc,
  compareCardIds,
  fullDeck,
  orderPokerHand,
  rankName,
  rankOf,
  rankPlural,
  rankSymbol,
  suitOf,
  type Suit,
} from './cards';
export { pokerHowToPlay } from './howto';
export { pokerCatalog } from './catalog';
export {
  TIER_BOTS,
  tierBot,
  makePolicy,
  chooseFromProfile,
  profileForTier,
  decideAction,
  chenScore,
  equity,
  preflopStrength,
  strengthNow,
  type BotProfile,
} from './bots';
export {
  PERSONAS,
  PERSONA_BOTS,
  makePersonaBot,
  personaById,
  type PersonaDef,
} from './bots/personas';
