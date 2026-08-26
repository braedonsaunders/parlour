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
