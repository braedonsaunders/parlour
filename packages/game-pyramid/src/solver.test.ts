import { describe, expect, it } from 'vitest';
import { legalMovesFor } from './game';
import { solvePyramid } from './solver';
import { applyMove, openSession } from './test-util';
import type { PyramidState } from './state';

/*
 * Pyramid is perfect information — the whole pyramid is face up — so a search
 * can prove a deal out. That matters more here than in most patiences because
 * the losing move looks exactly like the winning one: two cards summing to
 * thirteen, one of which was the last partner for a card still buried three
 * rows down. A greedy hint takes whichever pair it sees first and cannot know
 * the difference; the player finds out four moves later.
 */
describe('solvePyramid', () => {
  it('proves a line that clears the pyramid, and the line is playable', () => {
    let proved = 0;

    for (let seed = 1; seed <= 12; seed++) {
      let session = openSession(seed);
      const result = solvePyramid(session.state as PyramidState, { nodeBudget: 150_000 });
      if (result.outcome !== 'solved') continue;
      proved += 1;

      // Every move must be legal when its turn comes, and the last one must
      // actually clear the pyramid. A line that does not replay is worse than
      // no line at all.
      for (const move of result.line) {
        const legal = legalMovesFor(session.state as PyramidState);
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
      const finished = session.state as PyramidState;
      expect(finished.pyramid.flat().every((cell) => cell === null)).toBe(true);
    }

    expect(proved, 'several of twelve deals prove out').toBeGreaterThan(0);
  });

  it('reports its budget honestly rather than calling a deal impossible', () => {
    const session = openSession(4);
    const result = solvePyramid(session.state as PyramidState, { nodeBudget: 1 });

    expect(result.outcome).toBe('budget');
    expect(result.line).toHaveLength(0);
  });

  it('treats an already-cleared pyramid as solved with nothing left to do', () => {
    const session = openSession(3);
    const state = session.state as PyramidState;
    const cleared = { ...state, pyramid: state.pyramid.map((row) => row.map(() => null)) };

    expect(solvePyramid(cleared)).toMatchObject({ outcome: 'solved', line: [] });
  });

  /*
   * The solver proposes moves only from the pack's own `legalMovesFor`, so it
   * cannot invent one the rules would refuse — including the recycle limit,
   * which is the rule easiest to get wrong when reimplemented.
   */
  it('never proposes a move the rules would refuse', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let session = openSession(seed);
      const result = solvePyramid(session.state as PyramidState, { nodeBudget: 60_000 });
      for (const move of result.line) {
        expect(legalMovesFor(session.state as PyramidState).map((m) => m.id)).toContain(move.id);
        session = applyMove(session, move);
      }
    }
  });
});
