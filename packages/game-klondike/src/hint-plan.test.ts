import { describe, expect, it } from 'vitest';
import { describeHintMove, hintFor, klondikePlayerView, legalMovesFor } from './game';
import { createHintPlanner, sameLegalMove, solverHintFor } from './hint-plan';
import { solveKlondike } from './solver';
import { applyMove, emptyState, openSession } from './test-util';
import { klondikeDealFor } from './winnable';

describe('solver hints', () => {
  it('names a foundation retreat the greedy hinter never offers', () => {
    const state = emptyState({
      foundations: { spades: [], hearts: ['H1', 'H2', 'H3'], diamonds: [], clubs: [] },
    });
    state.tableau[0] = { down: [], up: ['S4'] };
    const move = { id: 'foundation.toTableau', payload: { suit: 'hearts', to: 0 } };

    expect(hintFor(klondikePlayerView(state))?.move.id).not.toBe('foundation.toTableau');
    expect(describeHintMove(klondikePlayerView(state), move)).toBe(
      'Bring the 3 of hearts back onto the 4 of spades.',
    );
  });

  it('opens a proven deal on the solver’s own first move', () => {
    const state = klondikeDealFor(5, 3);
    const solved = solveKlondike(state, { drawCount: 3 });
    const hint = solverHintFor(state, { drawCount: 3 });

    expect(solved.outcome).toBe('solved');
    expect(hint).not.toBeNull();
    expect(sameLegalMove(hint!.move, solved.line[0]!)).toBe(true);
  }, 60_000);

  it('clears a proven deal when the player follows the planned line', () => {
    const solved = solveKlondike(klondikeDealFor(5, 3), { drawCount: 3 });
    expect(solved.outcome).toBe('solved');

    const planner = createHintPlanner(solved.line);
    let session = openSession(5, { drawCount: 3 });
    for (let step = 0; step < 400 && session.state.stage !== 'won'; step++) {
      const hint = planner.hint(session.state);
      expect(hint).not.toBeNull();
      session = applyMove(session, hint!.move);
      planner.follow(hint!.move);
    }

    expect(session.state.stage).toBe('won');
  }, 60_000);

  it('re-solves after a side path instead of walking a stale line', () => {
    const planner = createHintPlanner(solveKlondike(klondikeDealFor(5, 3), { drawCount: 3 }).line);
    let session = openSession(5, { drawCount: 3 });
    const planned = planner.hint(session.state);
    expect(planned).not.toBeNull();
    const other = legalMovesFor(session.state).find((move) => !sameLegalMove(move, planned!.move));
    expect(other).toBeTruthy();

    session = applyMove(session, other!);
    planner.follow(other!);
    const next = planner.hint(session.state);
    expect(next).not.toBeNull();
    session = applyMove(session, next!.move);
    expect(session.state.stage === 'playing' || session.state.stage === 'won').toBe(true);
  }, 60_000);
});
