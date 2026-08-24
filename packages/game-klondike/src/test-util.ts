import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { klondikeConfig, type KlondikeRules } from './config';
import { klondikeGame } from './game';
import type { KlondikeState } from './state';

export type KlondikeSession = GameSession<KlondikeState, KlondikeRules>;

export function openSession(seed = 7, rules: Partial<KlondikeRules> = {}): KlondikeSession {
  return createSession(klondikeGame, {
    seed,
    config: klondikeConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: KlondikeState): KlondikeSession {
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

export function applyMove(session: KlondikeSession, move: LegalMove): KlondikeSession {
  const outcome = sessionApply(klondikeGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

export function emptyState(overrides: Partial<KlondikeState> = {}): KlondikeState {
  return {
    rules: klondikeConfig.resolve({}),
    stage: 'playing',
    stock: [],
    waste: [],
    tableau: Array.from({ length: 7 }, () => ({ down: [], up: [] })),
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    moves: 0,
    recycles: 0,
    ...overrides,
  };
}
