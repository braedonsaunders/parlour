import type { CardId, LegalMove } from '@parlour/engine';
import { TABLEAU_COLUMNS, canPlayOnHole } from './cards';
import type { GolfState, TableauPlayPayload } from './state';

/**
 * A Golf solver, and the reason one is worth writing.
 *
 * Golf is perfect information — every tableau card is dealt face up — so a
 * search can prove a hole out rather than guess at it. That matters because the
 * greedy hinter cannot: it prefers a play that starts a chain and otherwise
 * takes the first column that fits, which is exactly the move that strands the
 * card underneath it. Knowing which of two identical-looking plays keeps the
 * hole alive is the whole skill of the game, and it is not a local property.
 *
 * The position is small enough to search honestly. The columns never change
 * order and cards only ever leave them, so a whole position is
 * (seven column heights, the card on the hole, how much stock is spent) — and
 * the stock is a fixed sequence, so its index is enough. That collapses the
 * tree hard: the same board reached by a different move order is the same key.
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
}

const DEFAULT_NODE_BUDGET = 120_000;

interface Board {
  /** How many cards remain in each column; the foot is at `height - 1`. */
  heights: number[];
  hole: CardId | null;
  /** How many stock cards have been turned. */
  spent: number;
  remaining: number;
}

function footOf(state: GolfState, board: Board, column: number): CardId | null {
  const height = board.heights[column] ?? 0;
  return height > 0 ? (state.tableau[column]?.[height - 1] ?? null) : null;
}

function key(board: Board): string {
  return `${board.heights.join(',')}|${board.hole ?? '-'}|${board.spent}`;
}

/**
 * Walks a Golf hole looking for a line that clears the grass.
 *
 * Depth-first with memoisation rather than a scored frontier: the tree is
 * shallow (a hole is at most fifty-two moves) and narrow (eight branches), and
 * every position is a strict step towards the end, so there is no cycle to
 * guard against and nothing to gain from ordering the frontier.
 */
export function solveGolf(state: GolfState, options: SolveOptions = {}): SolveResult {
  const budget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const stock = state.stock;
  const root: Board = {
    heights: Array.from(
      { length: TABLEAU_COLUMNS },
      (_, column) => state.tableau[column]?.length ?? 0,
    ),
    hole: state.waste.at(-1) ?? null,
    spent: 0,
    remaining: state.tableau.reduce((total, column) => total + column.length, 0),
  };

  if (root.remaining === 0) return { outcome: 'solved', nodes: 0, line: [] };

  const seen = new Set<string>();
  const line: LegalMove[] = [];
  let nodes = 0;
  let ranOut = false;

  function descend(board: Board): boolean {
    if (board.remaining === 0) return true;
    if (nodes >= budget) {
      ranOut = true;
      return false;
    }
    nodes += 1;
    const id = key(board);
    if (seen.has(id)) return false;
    seen.add(id);

    // Plays before draws: a draw is never forced while a card still fits, and
    // spending the stock early is the one irreversible thing in this game.
    for (let column = 0; column < TABLEAU_COLUMNS; column++) {
      const foot = footOf(state, board, column);
      if (!foot || !board.hole || !canPlayOnHole(foot, board.hole, state.rules.wrap)) continue;
      const heights = board.heights.slice();
      heights[column] = (heights[column] ?? 0) - 1;
      line.push({ id: 'tableau.play', payload: { from: column } satisfies TableauPlayPayload });
      if (descend({ heights, hole: foot, spent: board.spent, remaining: board.remaining - 1 })) {
        return true;
      }
      line.pop();
      if (ranOut) return false;
    }

    if (board.spent < stock.length) {
      const turned = stock[stock.length - 1 - board.spent] ?? null;
      line.push({ id: 'stock.draw' });
      if (
        descend({
          heights: board.heights,
          hole: turned,
          spent: board.spent + 1,
          remaining: board.remaining,
        })
      ) {
        return true;
      }
      line.pop();
    }
    return false;
  }

  const solved = descend(root);
  if (solved) return { outcome: 'solved', nodes, line: line.slice() };
  return { outcome: ranOut ? 'budget' : 'exhausted', nodes, line: [] };
}

/** True when this hole can be cleared at all. Used by deal search, not by hints. */
export function isWinnableDeal(state: GolfState, options: SolveOptions = {}): boolean {
  return solveGolf(state, options).outcome === 'solved';
}
