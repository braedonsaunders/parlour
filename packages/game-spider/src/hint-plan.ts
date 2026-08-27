import type { LegalMove } from '@parlour/engine';
import {
  describeHintMove,
  hintFor,
  legalMovesFor,
  spiderPlayerView,
  type SpiderHint,
} from './game';
import { solveSpider, type SolveOptions } from './solver';
import type { SpiderState } from './state';

/**
 * Spider hints that advance the game.
 *
 * The greedy hinter ranks each legal move on its own local merits — does it
 * complete a run, turn a hidden card, keep a suit together — and has no notion
 * of progress. Two moves can each look fine while undoing one another, which is
 * exactly what it did: shift a card across, then next turn suggest shifting it
 * back, forever, because both score the same twenty points.
 *
 * The solver already knows better. It returns a proven winning line, and the
 * first move of that line is a hint that always gets somewhere. Klondike has
 * worked this way for a while; this is Spider catching up.
 */

export function sameLegalMove(left: LegalMove, right: LegalMove): boolean {
  if (left.id !== right.id) return false;
  return JSON.stringify(left.payload ?? null) === JSON.stringify(right.payload ?? null);
}

function isLegal(state: SpiderState, move: LegalMove): boolean {
  return legalMovesFor(state).some((legal) => sameLegalMove(legal, move));
}

function spokenHint(state: SpiderState, move: LegalMove): SpiderHint {
  return { move, reason: describeHintMove(spiderPlayerView(state), move) };
}

/**
 * Next move on a proven winning line when the solver can find one, falling back
 * to the greedy hinter only when the position itself has no proof — a hint that
 * merely looks sensible still beats no hint at all.
 */
export function solverHintFor(state: SpiderState, options: SolveOptions = {}): SpiderHint | null {
  if (state.stage !== 'playing') return null;
  const result = solveSpider(state, options);
  if (result.outcome === 'solved' && result.line[0]) return spokenHint(state, result.line[0]);
  return hintFor(spiderPlayerView(state));
}

export interface HintPlanner {
  hint(state: SpiderState, options?: SolveOptions): SpiderHint | null;
  follow(move: LegalMove): void;
  rewind(): void;
  invalidate(): void;
}

/**
 * Walks a cached winning line so following hints does not re-search.
 *
 * Spider's search is dearer than Klondike's — ten columns, two decks — so this
 * matters more here than it did there. A line proved once is walked move by
 * move; the solver is only asked again when the player leaves it.
 */
export function createHintPlanner(line: readonly LegalMove[] = []): HintPlanner {
  const original = line.slice();
  let remaining = original.slice();

  return {
    hint(state, options) {
      if (state.stage !== 'playing') return null;
      const head = remaining[0];
      if (head && isLegal(state, head)) return spokenHint(state, head);
      const result = solveSpider(state, options);
      if (result.outcome === 'solved' && result.line[0]) {
        remaining = result.line.slice();
        return spokenHint(state, remaining[0]!);
      }
      remaining = [];
      return hintFor(spiderPlayerView(state));
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
