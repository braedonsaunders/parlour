export { golfCatalog } from './catalog';
export { solveGolf, isWinnableDeal, type SolveOptions, type SolveResult } from './solver';
export {
  DECK,
  GOLF_SEATS,
  SUITS,
  TABLEAU_COLUMNS,
  TABLEAU_ROWS,
  TABLEAU_SIZE,
  canPlayOnHole,
  colorOfCard,
  orderGolfHand,
  rankOfCard,
  suitOfCard,
  type GolfSuit,
} from './cards';
export { golfConfig, type GolfRules } from './config';
export { dailySeed, isDailyKey } from './daily';
export {
  GAME_ID,
  GolfFx,
  createGolfDef,
  golfGame,
  golfPlayerView,
  hasTableauPlay,
  hintFor,
  leftoverOf,
  legalMovesFor,
  type GolfHint,
} from './game';
export { createHintPlanner, sameLegalMove, solverHintFor, type HintPlanner } from './hint-plan';
export { golfHowToPlay } from './howto';
export type {
  GolfPlayerView,
  GolfStage,
  GolfState,
  HiddenGolfCard,
  TableauPlayPayload,
} from './state';
