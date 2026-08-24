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
export {
  RATSCREW_PERSONAS,
  PERSONA_BY_TIER,
  botPolicyFor,
  simulateRealtimeGame,
  replaysIdentically,
  type RealtimeRecord,
  type RealtimeStats,
  type SlapPersona,
} from './realtime';
export {
  DEFAULT_THRESHOLDS,
  runBalanceGates,
  type GateReport,
  type GateThresholds,
} from './sim/gates';
export { houseBot, ratscrewGame, SLAP_GRACE_MS } from './game';
export type { RatscrewChallenge, RatscrewState, RatscrewWindow } from './game';

/** canonical game id, mirrored for transport/session wiring */
export const GAME_ID = 'ratscrew';
