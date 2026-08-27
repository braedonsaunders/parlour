import type { LegalMove } from '@parlour/engine';
import {
  describeHintMove,
  freecellPlayerView,
  hintFor,
  legalMovesFor,
  type FreecellHint,
} from './game';
import { solveFreecell, type SolveOptions } from './solver';
import type { FreecellState } from './state';

function sameLegalMove(left: LegalMove, right: LegalMove): boolean {
  if (left.id !== right.id) return false;
  return JSON.stringify(left.payload ?? null) === JSON.stringify(right.payload ?? null);
}

function isLegal(state: FreecellState, move: LegalMove): boolean {
  return legalMovesFor(state).some((legal) => sameLegalMove(legal, move));
}

/**
 * Next move on a proven winning line when the solver can find one. Falls back
 * to the public greedy hinter only when the position itself has no proof.
 * This is the FreeCell hint pattern ported from Klondike's `hint-plan.ts` —
 * the solver's job is not to prove a deal winnable (the player already has
 * that for ~32,000 in 32,001 Classic deals); it is to know the *next* move
 * that a winning line takes.
 */
export function solverHintFor(
  state: FreecellState,
  options: SolveOptions = {},
): FreecellHint | null {
  if (state.stage !== 'playing') return null;
  const result = solveFreecell(state, options);
  if (result.outcome === 'solved' && result.line[0] && isLegal(state, result.line[0])) {
    return {
      move: result.line[0],
      reason: describeHintMove(freecellPlayerView(state), result.line[0]),
    };
  }
  return hintFor(freecellPlayerView(state));
}

export interface HintPlanner {
  hint(state: FreecellState, options?: SolveOptions): FreecellHint | null;
  follow(move: LegalMove): void;
  rewind(): void;
  invalidate(): void;
}

/**
 * Walks a cached winning line so following hints does not re-search.
 *
 * `solverHintFor` proves the position from scratch on every call, which is a
 * whole search for each hint even when the player is simply doing what the last
 * one said. Following a line the solver already found costs nothing; only
 * leaving it pays again. Same planner Klondike and Spider use.
 */
export function createHintPlanner(line: readonly LegalMove[] = []): HintPlanner {
  const original = line.slice();
  let remaining = original.slice();

  return {
    hint(state, options) {
      if (state.stage !== 'playing') return null;
      const head = remaining[0];
      if (head && isLegal(state, head)) {
        return { move: head, reason: describeHintMove(freecellPlayerView(state), head) };
      }
      const result = solveFreecell(state, options);
      if (result.outcome === 'solved' && result.line[0] && isLegal(state, result.line[0])) {
        remaining = result.line.slice();
        const next = remaining[0]!;
        return { move: next, reason: describeHintMove(freecellPlayerView(state), next) };
      }
      remaining = [];
      return hintFor(freecellPlayerView(state));
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
