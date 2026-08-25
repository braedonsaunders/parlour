import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { spiderConfig, type SpiderRules } from './config';
import { spiderGame } from './game';
import type { SpiderState } from './state';

export type SpiderSession = GameSession<SpiderState, SpiderRules>;

export function openSession(seed = 7, rules: Partial<SpiderRules> = {}): SpiderSession {
  return createSession(spiderGame, {
    seed,
    config: spiderConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: SpiderState): SpiderSession {
  const base = openSession();
  return {
    ...base,
    config: state.rules,
    state,
    phase: { phase: state.stage, actor: state.stage === 'playing' ? 0 : null, round: 1 },
    status: state.stage === 'won' ? 'ended' : 'playing',
    result: null,
    log: [],
  };
}

export function applyMove(session: SpiderSession, move: LegalMove): SpiderSession {
  const outcome = sessionApply(spiderGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

export function emptyState(overrides: Partial<SpiderState> = {}): SpiderState {
  return {
    rules: spiderConfig.resolve({}),
    stage: 'playing',
    stock: [],
    tableau: Array.from({ length: 10 }, () => ({ down: [], up: [] })),
    foundations: Array.from({ length: 8 }, () => []),
    moves: 0,
    ...overrides,
  };
}
