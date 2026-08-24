// @parlour/game-ratscrew — Egyptian Ratscrew: flip races, face-card challenges, slap patterns.
export {
  ratscrewConfigSchema,
  type RatscrewConfig,
} from './config';
export {
  detectPattern,
  isFaceCard,
  chancesFor,
  rankOf,
  type SlapPattern,
} from './patterns';
export { ratscrewHowToPlay } from './howto';
export { houseBot, ratscrewGame } from './game';
export type { RatscrewChallenge, RatscrewState } from './game';

/** canonical game id, mirrored for transport/session wiring */
export const GAME_ID = 'ratscrew';
