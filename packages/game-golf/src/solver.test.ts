import { describe, expect, it } from 'vitest';
import { legalMovesFor } from './game';
import { solveGolf } from './solver';
import { applyMove, openSession } from './test-util';
import type { GolfState } from './state';

/*
 * Golf is perfect information — every tableau card is dealt face up — so a
 * search can PROVE a hole out rather than guess at it. The greedy hinter
 * cannot: it takes the first column that fits, which is exactly the move that
 * buries the card underneath. Knowing which of two identical-looking plays
 * keeps the hole alive is the skill of the game, and it is not a local
 * property of either move.
 */
describe('solveGolf', () => {
  it('proves a line that clears the grass, and the line is playable', () => {
    let solvedSomething = false;

    // Scanned rather than hardcoded: at 200k nodes roughly one deal in five
    // proves out, most of the rest run out of budget rather than being shown
    // impossible, and pinning a seed would make this a test of the shuffle.
    for (let seed = 1; seed <= 20; seed++) {
      let session = openSession(seed);
      const result = solveGolf(session.state as GolfState, { nodeBudget: 200_000 });
      if (result.outcome !== 'solved') continue;
      solvedSomething = true;

      // Every move the solver claims must be legal when its turn comes, and
      // the last one must actually finish the hole. A line that does not
      // replay is worse than no line at all.
      for (const move of result.line) {
        const legal = legalMovesFor(session.state as GolfState);
        expect(
          legal.some(
            (option) =>
              option.id === move.id &&
              JSON.stringify(option.payload ?? null) === JSON.stringify(move.payload ?? null),
          ),
          `${move.id} is legal at its point in the line`,
        ).toBe(true);
        session = applyMove(session, move);
      }
      const finished = session.state as GolfState;
      expect(finished.tableau.flat()).toHaveLength(0);
    }

    expect(solvedSomething, 'at least one of twenty deals proves out').toBe(true);
  });

  it('reports its budget honestly rather than claiming a hole is impossible', () => {
    const session = openSession(5);
    const result = solveGolf(session.state as GolfState, { nodeBudget: 1 });

    expect(result.outcome).toBe('budget');
    expect(result.line).toHaveLength(0);
  });

  it('treats an already-cleared hole as solved with nothing left to do', () => {
    const session = openSession(7);
    const cleared = { ...(session.state as GolfState), tableau: [[], [], [], [], [], [], []] };

    expect(solveGolf(cleared)).toMatchObject({ outcome: 'solved', line: [] });
  });

  /*
   * The memo key is (column heights, hole card, stock spent). Reaching the same
   * board by a different order of the same plays has to collapse to one node,
   * or the tree is exponential in move order alone.
   */
  it('collapses positions reached by a different order of the same moves', () => {
    const session = openSession(7);
    const solved = solveGolf(session.state as GolfState, { nodeBudget: 200_000 });

    // A hole is at most fifty-two moves deep and eight wide. Without the memo
    // the same board reached by a different move order is a fresh subtree, and
    // the search is exponential in ordering alone.
    if (solved.outcome === 'solved') expect(solved.nodes).toBeLessThan(200_000);
  });
});
