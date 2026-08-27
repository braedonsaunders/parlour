import type { LegalMove } from '@parlour/engine';
import { hintFor, legalMovesFor, pyramidPlayerView, type PyramidHint } from './game';
import { solvePyramid, type SolveOptions } from './solver';
import type { PyramidState } from './state';

/**
 * Pyramid hints that can see past the next pair.
 *
 * The losing move looks exactly like the winning one — two cards summing to
 * thirteen — and the difference is whether one of them was the last partner for
 * a card still buried three rows down. The greedy hinter takes whichever pair
 * it finds first and cannot know; you find out four moves later when nothing
 * matches and the stock is spent. Pyramid is perfect information, so the solver
 * can simply prove which pair keeps the deal alive.
 */

export function sameLegalMove(left: LegalMove, right: LegalMove): boolean {
  if (left.id !== right.id) return false;
  return JSON.stringify(left.payload ?? null) === JSON.stringify(right.payload ?? null);
}

function isLegal(state: PyramidState, move: LegalMove): boolean {
  return legalMovesFor(state).some((legal) => sameLegalMove(legal, move));
}

function spoken(move: LegalMove): PyramidHint {
  switch (move.id) {
    case 'pyramid.remove':
      return { move, reason: 'Kings go on their own.' };
    case 'stock.draw':
      return { move, reason: 'Turn the next card.' };
    case 'stock.recycle':
      return { move, reason: 'Turn the waste back over.' };
    default:
      return { move, reason: 'Pair these two — it keeps the deal alive.' };
  }
}

/**
 * Next move on a proven line when the solver can find one, falling back to the
 * greedy hinter otherwise — a hint that merely looks sensible still beats none.
 */
export function solverHintFor(state: PyramidState, options: SolveOptions = {}): PyramidHint | null {
  if (state.stage !== 'playing') return null;
  const result = solvePyramid(state, options);
  if (result.outcome === 'solved' && result.line[0]) return spoken(result.line[0]);
  return hintFor(pyramidPlayerView(state));
}

export interface HintPlanner {
  hint(state: PyramidState, options?: SolveOptions): PyramidHint | null;
  follow(move: LegalMove): void;
  rewind(): void;
  invalidate(): void;
}

/** Walks a cached line so following hints does not re-search. */
export function createHintPlanner(line: readonly LegalMove[] = []): HintPlanner {
  const original = line.slice();
  let remaining = original.slice();

  return {
    hint(state, options) {
      if (state.stage !== 'playing') return null;
      const head = remaining[0];
      if (head && isLegal(state, head)) return spoken(head);
      const result = solvePyramid(state, options);
      if (result.outcome === 'solved' && result.line[0]) {
        remaining = result.line.slice();
        return spoken(remaining[0]!);
      }
      remaining = [];
      return hintFor(pyramidPlayerView(state));
    },
    follow(move) {
      const head = remaining[0];
      remaining = head && sameLegalMove(head, move) ? remaining.slice(1) : [];
    },
    rewind() {
      remaining = original.slice();
    },
    invalidate() {
      remaining = [];
    },
  };
}
