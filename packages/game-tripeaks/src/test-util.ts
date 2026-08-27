import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { emptyTableau } from './cards';
import { tripeaksConfig, type TripeaksRules } from './config';
import { tripeaksGame } from './game';
import type { TripeaksState } from './state';

export type TripeaksSession = GameSession<TripeaksState, TripeaksRules>;

export function openSession(seed = 7, rules: Partial<TripeaksRules> = {}): TripeaksSession {
  return createSession(tripeaksGame, {
    seed,
    config: tripeaksConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: TripeaksState): TripeaksSession {
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

export function applyMove(session: TripeaksSession, move: LegalMove): TripeaksSession {
  const outcome = sessionApply(tripeaksGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

export function emptyState(overrides: Partial<TripeaksState> = {}): TripeaksState {
  return {
    rules: tripeaksConfig.resolve({}),
    stage: 'playing',
    tableau: emptyTableau(),
    stock: [],
    hole: [],
    moves: 0,
    recycles: 0,
    ...overrides,
  };
}
