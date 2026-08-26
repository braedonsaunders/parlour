import { describe, expect, it } from 'vitest';
import { openSession } from './test-util';
import { solverHintFor } from './hint-plan';

/**
 * The hint-plan tests that matter: a solver-backed hint points at the next
 * move on a *proven* winning line, or it falls back to the greedy hinter when
 * no proof exists. A solver hint that says the wrong thing is worse than a
 * greedy hint, because it carries the authority of a search.
 */
describe('solverHintFor', () => {
  it('returns a hint for a deal the solver can prove', () => {
    // Seed 5 proves at 4 cells — the solver's own test asserts the same deal.
    const session = openSession(5, { freeCells: 4 });
    const hint = solverHintFor(session.state);
    expect(hint).not.toBeNull();
    expect(hint!.move).toBeDefined();
    expect(hint!.reason.length).toBeGreaterThan(0);
  }, 60_000);

  it('never hands back a move the current state cannot accept', () => {
    // A hint whose payload is stale or wrong is not a hint; it is a lure.
    const session = openSession(5, { freeCells: 4 });
    const hint = solverHintFor(session.state);
    if (hint === null) return;
    const legal = session.def.flow.legalMoves(session.state, session.phase);
    const offered = legal.some(
      (move) =>
        move.id === hint.move.id &&
        JSON.stringify(move.payload ?? null) === JSON.stringify(hint.move.payload ?? null),
    );
    expect(offered).toBe(true);
  }, 60_000);
});
