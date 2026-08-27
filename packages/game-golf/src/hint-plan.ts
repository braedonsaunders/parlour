import type { LegalMove } from '@parlour/engine';
import { golfPlayerView, hintFor, legalMovesFor, type GolfHint } from './game';
import { solveGolf, type SolveOptions } from './solver';
import type { GolfState } from './state';

/**
 * Golf hints that know where they are going.
 *
 * The greedy hinter prefers a play that starts a chain and otherwise takes the
 * first column that fits — and the first column that fits is often the one that
 * buries a card the hole will need later. Golf is perfect information, so the
 * solver can prove a line out instead of guessing, and the first move of that
 * line is a hint that does not strand you three plays from now.
 */

export function sameLegalMove(left: LegalMove, right: LegalMove): boolean {
  if (left.id !== right.id) return false;
  return JSON.stringify(left.payload ?? null) === JSON.stringify(right.payload ?? null);
}

function isLegal(state: GolfState, move: LegalMove): boolean {
  return legalMovesFor(state).some((legal) => sameLegalMove(legal, move));
}

function spoken(state: GolfState, move: LegalMove): GolfHint {
  const view = golfPlayerView(state);
  if (move.id === 'stock.draw') return { move, reason: 'Turn the next hole card.' };
  const from = (move.payload as { from?: number } | undefined)?.from;
  const card = typeof from === 'number' ? view.tableau[from]?.at(-1) : undefined;
  const next = typeof from === 'number' ? view.tableau[from]?.at(-2) : undefined;
  if (card && next) return { move, reason: 'Play it, and the card under it follows.' };
  return { move, reason: 'Play onto the hole.' };
}

/**
 * Next move on a proven line when the solver can find one, falling back to the
 * greedy hinter otherwise — a hint that merely looks sensible still beats none.
 */
export function solverHintFor(state: GolfState, options: SolveOptions = {}): GolfHint | null {
  if (state.stage !== 'playing') return null;
  const result = solveGolf(state, options);
  if (result.outcome === 'solved' && result.line[0]) return spoken(state, result.line[0]);
  return hintFor(golfPlayerView(state));
}

export interface HintPlanner {
  hint(state: GolfState, options?: SolveOptions): GolfHint | null;
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
      if (head && isLegal(state, head)) return spoken(state, head);
      const result = solveGolf(state, options);
      if (result.outcome === 'solved' && result.line[0]) {
        remaining = result.line.slice();
        return spoken(state, remaining[0]!);
      }
      remaining = [];
      return hintFor(golfPlayerView(state));
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
