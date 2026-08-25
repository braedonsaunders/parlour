import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { emptyPyramid } from './cards';
import { pyramidConfig, type PyramidRules } from './config';
import { pyramidGame } from './game';
import type { PyramidState } from './state';

export type PyramidSession = GameSession<PyramidState, PyramidRules>;

export function openSession(seed = 7, rules: Partial<PyramidRules> = {}): PyramidSession {
  return createSession(pyramidGame, {
    seed,
    config: pyramidConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: PyramidState): PyramidSession {
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

export function applyMove(session: PyramidSession, move: LegalMove): PyramidSession {
  const outcome = sessionApply(pyramidGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

export function emptyState(overrides: Partial<PyramidState> = {}): PyramidState {
  return {
    rules: pyramidConfig.resolve({}),
    stage: 'playing',
    pyramid: emptyPyramid(),
    stock: [],
    waste: [],
    moves: 0,
    recycles: 0,
    ...overrides,
  };
}
