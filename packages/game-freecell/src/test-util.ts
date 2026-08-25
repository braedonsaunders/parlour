import { createSession, sessionApply, type GameSession, type LegalMove } from '@parlour/engine';
import { CLASSIC_CELLS, TABLEAU_COLUMNS } from './cards';
import { freecellConfig, type FreecellRules } from './config';
import { freecellGame } from './game';
import type { FreecellState } from './state';

export type FreecellSession = GameSession<FreecellState, FreecellRules>;

export function openSession(seed = 7, rules: Partial<FreecellRules> = {}): FreecellSession {
  return createSession(freecellGame, {
    seed,
    config: freecellConfig.resolve(rules),
    seats: 1,
  });
}

export function sessionWithState(state: FreecellState): FreecellSession {
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

export function applyMove(session: FreecellSession, move: LegalMove): FreecellSession {
  const outcome = sessionApply(freecellGame, session, 0, move.id, move.payload);
  if (outcome.rejected) throw new Error(`${move.id}: ${outcome.rejected.code}`);
  return outcome.session;
}

/** Fill idle cells so unit cases are not drowned in parking moves. */
export function isolate(state: FreecellState): FreecellState {
  const used = new Set<string>([
    ...state.tableau.flat(),
    ...state.cells.filter((card): card is string => card !== null),
    ...Object.values(state.foundations).flat(),
  ]);
  const leftovers = ['C11', 'D11', 'S11', 'H11', 'C3', 'D3'].filter((card) => !used.has(card));
  let next = 0;
  const cells = state.cells.map((cell) => {
    if (cell) return cell;
    return leftovers[next++] ?? null;
  });
  return { ...state, cells };
}

export function emptyState(overrides: Partial<FreecellState> = {}): FreecellState {
  const rules = overrides.rules ?? freecellConfig.resolve({});
  return {
    stage: 'playing',
    tableau: Array.from({ length: TABLEAU_COLUMNS }, () => []),
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    moves: 0,
    ...overrides,
    rules,
    cells: overrides.cells ?? Array.from({ length: rules.freeCells ?? CLASSIC_CELLS }, () => null),
  };
}
