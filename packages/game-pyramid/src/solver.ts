import type { CardId, LegalMove } from '@parlour/engine';
import { legalMovesFor } from './game';
import type { PairPayload, PyramidSource, PyramidState, RemovePayload } from './state';

/**
 * A Pyramid solver, and why the greedy hinter needed replacing.
 *
 * Pyramid is perfect information — the whole pyramid is dealt face up — so a
 * search can prove a deal out instead of guessing. That matters more here than
 * in most patiences, because the losing move looks exactly like the winning
 * one: two cards summing to thirteen, one of which was the only partner left
 * for a card still buried three rows down. The greedy hinter takes whichever
 * pair it finds first and cannot see that; you discover it four moves later
 * when nothing matches and the stock is spent.
 *
 * The search reuses the pack's own `legalMovesFor`, so it can never propose a
 * move the rules would refuse, and applies the four transforms directly: a pair
 * and a king removal clear cards, a draw moves one card from stock to waste,
 * and a recycle turns the waste back over. Nothing here restates a rule.
 */

export type SolveOutcome = 'solved' | 'exhausted' | 'budget';

export interface SolveResult {
  outcome: SolveOutcome;
  /** Positions expanded, so a caller can tune the budget against real deals. */
  nodes: number;
  /** Winning line as ordinary game moves, empty unless `outcome` is `solved`. */
  line: readonly LegalMove[];
}

export interface SolveOptions {
  /** Hard ceiling on expanded positions. */
  nodeBudget?: number;
  /**
   * Hard ceiling on search depth.
   *
   * Not a tuning knob — a correctness one. A deal with an unlimited recycle
   * allowance can draw and turn over forever, and because the recycle count is
   * part of the position key those states never repeat, so the memo cannot stop
   * it. Without this the search runs until the JavaScript stack gives out.
   * Twenty-eight cards to clear plus a few passes through the deck is the real
   * shape of a solution; anything past that is the loop, not a line.
   */
  maxDepth?: number;
}

const DEFAULT_NODE_BUDGET = 120_000;
const DEFAULT_MAX_DEPTH = 220;

function clearedPyramid(state: PyramidState): boolean {
  return state.pyramid.every((row) => row.every((cell) => cell === null));
}

function removeAt(next: PyramidState, source: PyramidSource): void {
  if (source === 'waste') {
    next.waste = next.waste.slice(0, -1);
    return;
  }
  next.pyramid = next.pyramid.map((row, rowIndex) =>
    rowIndex === source.row ? row.map((cell, col) => (col === source.col ? null : cell)) : row,
  );
}

function step(state: PyramidState, move: LegalMove): PyramidState {
  const next: PyramidState = { ...state, moves: state.moves + 1 };
  switch (move.id) {
    case 'pyramid.pair': {
      const { a, b } = move.payload as PairPayload;
      // Waste first: removing a pyramid cell cannot move the waste, but
      // removing the waste top would shift what a later index means.
      removeAt(next, a === 'waste' ? a : b);
      removeAt(next, a === 'waste' ? b : a);
      return next;
    }
    case 'pyramid.remove':
      removeAt(next, (move.payload as RemovePayload).from);
      return next;
    case 'stock.draw': {
      const stock = next.stock.slice();
      const card = stock.pop() as CardId;
      next.stock = stock;
      next.waste = [...next.waste, card];
      return next;
    }
    case 'stock.recycle':
      next.stock = next.waste.slice().reverse();
      next.waste = [];
      next.recycles = next.recycles + 1;
      return next;
    default:
      return next;
  }
}

function key(state: PyramidState): string {
  const mask = state.pyramid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')).join('');
  return `${mask}|${state.stock.join(',')}|${state.waste.join(',')}|${state.recycles}`;
}

/**
 * Walks a Pyramid deal looking for a line that clears it.
 *
 * Depth-first with memoisation. Clearing cards is irreversible, so the only
 * way back to a position is a different order of the same removals — which the
 * key collapses. Draws and recycles are what make the tree deep, so they are
 * tried last: a pair available now is available after a draw too, but a draw
 * spends a card that may have been the partner something else needed.
 */
export function solvePyramid(state: PyramidState, options: SolveOptions = {}): SolveResult {
  const budget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (clearedPyramid(state)) return { outcome: 'solved', nodes: 0, line: [] };

  const seen = new Set<string>();
  const line: LegalMove[] = [];
  let nodes = 0;
  let ranOut = false;

  function descend(current: PyramidState, depth: number): boolean {
    if (clearedPyramid(current)) return true;
    if (depth >= maxDepth) {
      ranOut = true;
      return false;
    }
    if (nodes >= budget) {
      ranOut = true;
      return false;
    }
    nodes += 1;
    const id = key(current);
    if (seen.has(id)) return false;
    seen.add(id);

    const moves = legalMovesFor(current);
    const clears = moves.filter(
      (move) => move.id === 'pyramid.pair' || move.id === 'pyramid.remove',
    );
    const deck = moves.filter((move) => move.id === 'stock.draw' || move.id === 'stock.recycle');
    for (const move of [...clears, ...deck]) {
      line.push(move);
      if (descend(step(current, move), depth + 1)) return true;
      line.pop();
      if (ranOut) return false;
    }
    return false;
  }

  const solved = descend(state, 0);
  if (solved) return { outcome: 'solved', nodes, line: line.slice() };
  return { outcome: ranOut ? 'budget' : 'exhausted', nodes, line: [] };
}

/** True when this deal can be cleared at all. Used by deal search, not by hints. */
export function isWinnableDeal(state: PyramidState, options: SolveOptions = {}): boolean {
  return solvePyramid(state, options).outcome === 'solved';
}
