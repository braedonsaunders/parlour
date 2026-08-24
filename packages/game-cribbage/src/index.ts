// @parlour/game-cribbage — the classic pub race to 121.
export { cardValue, rankOf, suitOf, sumValues } from './cards';
export { cribbageConfigSchema } from './config';
export type { CribbageConfig } from './config';
export { cribbageHowToPlay } from './howto';
export { cribbageCatalog } from './catalog';
export {
  createCribbageDef,
  playableCards,
  peggingComplete,
  HAND_DEAL_SIZE,
  SKUNK_LINE,
  TARGET_SCORE,
} from './rules';
export type { CribbageDefOptions } from './rules';
export {
  hasNobs,
  isFourCardFlush,
  pegPlayScore,
  scoreFifteens,
  scoreFlush,
  scorePairs,
  scoreRuns,
  scoreShow,
} from './score';
export type { PegScore, ScoreEntry, ScoreReason, ShowScore } from './score';
export { createCribbageMatchDef, GAMES_TO_WIN } from './match';
export type { CribbageMatchState } from './match';
export type { CribbageState, GameOutcome, PeggingState } from './state';
export * from './bots';

/** canonical game id, mirrored for transport/session wiring */
export const GAME_ID = 'cribbage';
