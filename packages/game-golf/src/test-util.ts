import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { golfConfig, type GolfRules } from './config';
import { golfGame } from './game';
import type { GolfState } from './state';

export type GolfSession = GameSession<GolfState, GolfRules>;

export function openSession(seed = 7, rules: Partial<GolfRules> = {}): GolfSession {
  return createSession(golfGame, {
    seed,
    config: golfConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: GolfState): GolfSession {
  const base = openSession();
  return {
    ...base,
    config: state.rules,
    state,
    phase: { phase: state.stage, actor: state.stage === 'playing' ? 0 : null, round: 1 },
    status: state.stage === 'playing' ? 'playing' : 'ended',
    result: null,
    log: [],
  };
}

export function applyMove(session: GolfSession, move: LegalMove): GolfSession {
  const outcome = sessionApply(golfGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

export function emptyState(overrides: Partial<GolfState> = {}): GolfState {
  return {
    rules: golfConfig.resolve({}),
    stage: 'playing',
    stock: [],
    waste: [],
    tableau: Array.from({ length: 7 }, () => []),
    moves: 0,
    ...overrides,
  };
}
