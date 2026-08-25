import type { LegalMove } from '@parlour/engine';
import {
  describeHintMove,
  hintFor,
  klondikePlayerView,
  legalMovesFor,
  type KlondikeHint,
} from './game';
import { solveKlondike, type SolveOptions } from './solver';
import type { KlondikeState } from './state';

export function sameLegalMove(left: LegalMove, right: LegalMove): boolean {
  if (left.id !== right.id) return false;
  return JSON.stringify(left.payload ?? null) === JSON.stringify(right.payload ?? null);
}

function isLegal(state: KlondikeState, move: LegalMove): boolean {
  return legalMovesFor(state).some((legal) => sameLegalMove(legal, move));
}

function spokenHint(state: KlondikeState, move: LegalMove): KlondikeHint {
  return { move, reason: describeHintMove(klondikePlayerView(state), move) };
}

/**
 * Next move on a proven winning line when the solver can find one. Falls back
 * to the public greedy hinter only when the position itself has no proof.
 */
export function solverHintFor(
  state: KlondikeState,
  options: SolveOptions = {},
): KlondikeHint | null {
  if (state.stage !== 'playing') return null;
  const result = solveKlondike(state, options);
  if (result.outcome === 'solved' && result.line[0]) return spokenHint(state, result.line[0]);
  return hintFor(klondikePlayerView(state));
}

export interface HintPlanner {
  hint(state: KlondikeState, options?: SolveOptions): KlondikeHint | null;
  follow(move: LegalMove): void;
  rewind(): void;
  invalidate(): void;
}

/**
 * Walks a cached winning line so following hints does not re-search. A seeded
 * line from deal search is the same object the solver already proved.
 */
export function createHintPlanner(line: readonly LegalMove[] = []): HintPlanner {
  const original = line.slice();
  let remaining = original.slice();

  return {
    hint(state, options) {
      if (state.stage !== 'playing') return null;
      const head = remaining[0];
      if (head && isLegal(state, head)) return spokenHint(state, head);
      const result = solveKlondike(state, options);
      if (result.outcome === 'solved' && result.line[0]) {
        remaining = result.line.slice();
        return spokenHint(state, remaining[0]!);
      }
      remaining = [];
      return hintFor(klondikePlayerView(state));
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
