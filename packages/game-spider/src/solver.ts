import { createSession, type LegalMove } from '@parlour/engine';
import {
  FOUNDATION_SLOTS,
  STOCK_DEAL,
  TABLEAU_COLUMNS,
  completedRunStart,
  rankOfCard,
  suitOfCard,
  type SpiderSuitCount,
} from './cards';
import { spiderConfig, type SpiderRules } from './config';
import { spiderGame } from './game';
import type { SpiderState } from './state';

/**
 * A bounded "try to solve Spider" solver, ported from the Klondike/FreeCell
 * pattern. Same contract: **sound but not complete**. `solved` means a line
 * was walked and it replays through the real engine; `exhausted` and `budget`
 * both mean "no proof found".
 *
 * Spider is the honest one to under-deliver on. Two decks, ten columns, and a
 * face-down prefix per column make the state space far rougher than
 * Klondike's, and a complete same-suit run of thirteen is the only thing that
 * leaves the table. Measured proof rates at several budgets are in the report
 * that shipped this file; the finder only ever claims a deal after `solved`.
 */
export type SolveOutcome = 'solved' | 'exhausted' | 'budget';

export interface SolveResult {
  outcome: SolveOutcome;
  /** Search nodes expanded, so callers can tune the budget against real deals. */
  nodes: number;
  /** Deepest solver move reached before the outcome stemmed the search. */
  moves: number;
  /** Winning line as ordinary game moves, empty unless `outcome` is `solved`. */
  line: readonly LegalMove[];
}

export interface SolveOptions {
  /** Hard ceiling on expanded nodes. */
  nodeBudget?: number;
  /** Hard ceiling on search depth, a backstop against pathological dives. */
  maxDepth?: number;
  /** Position scoring weights; see {@link SolveWeights}. */
  weights?: Partial<SolveWeights>;
}

/**
 * Weights for the position score that drives the search order. Completed
 * runs and empty columns lead; hidden cards and un-packed-up cards trail.
 */
export interface SolveWeights {
  complete: number;
  hidden: number;
  emptyColumn: number;
  /** Per face-up card outside the longest same-suit packed suffix. */
  burden: number;
  /** Charged per move made. */
  depth: number;
}

/**
 * Tuned by sweep across suits: the depth charge exists to stop sideways
 * wander, but any charge on Spider drains the whole search sideways fast —
 * zero out-performed every positive value measured. See the report numbers.
 */
const DEFAULT_WEIGHTS: SolveWeights = {
  complete: 50,
  hidden: 30,
  emptyColumn: 30,
  burden: 2,
  depth: 0,
};

/** 500k nodes is what the report numbers use. */
const DEFAULT_NODE_BUDGET = 500_000;
const DEFAULT_MAX_DEPTH = 2_000;

/**
 * Spider names cards as ids like 'S13b'; unique ids mean any card pins its
 * column, so carries and trails hold indexes straight through.
 */
interface Board {
  tableau: SpiderColumnInt[];
  /** Remaining stock in deal order; `stock.deal` pops from the end. */
  stock: string[];
  /** Completed same-suit K→A runs taken so far. */
  completed: number;
}

interface SpiderColumnInt {
  down: string[];
  up: string[];
}

/** A solver move: only `tableau.move` and `stock.deal` exist in Spider. */
export type SolverMove =
  { kind: 'tableauMove'; from: number; card: string; to: number } | { kind: 'stockDeal' };

function boardFrom(state: SpiderState): Board {
  return {
    tableau: state.tableau.map((column) => ({
      down: column.down.slice(),
      up: column.up.slice(),
    })),
    stock: state.stock.slice(),
    completed: state.foundations.filter((pile) => pile.length > 0).length,
  };
}

function cloneBoard(board: Board): Board {
  return {
    tableau: board.tableau.map((column) => ({ down: column.down.slice(), up: column.up.slice() })),
    stock: board.stock.slice(),
    completed: board.completed,
  };
}

/**
 * A completed run leaves immediately and the column it left flips its down
 * card when that emptied its face-up side — the engine's `clearCompletedSuits`
 * does both in one sweep, and a solver that forgets the flip desynchronises
 * its own trail a hundred moves deep.
 */
function clearColumn(column: SpiderColumnInt): number {
  let completed = 0;
  let start = completedRunStart(column.up);
  while (start >= 0) {
    column.up.splice(start);
    completed++;
    start = completedRunStart(column.up);
  }
  if (completed > 0 && column.up.length === 0 && column.down.length > 0) {
    column.up.push(column.down.pop()!);
  }
  return completed;
}

/** Full card ids joined by '.', with the down/up split marked; deterministic. */
function boardKey(board: Board): string {
  let key = '';
  for (const column of board.tableau) {
    key += `${column.down.join('.')}/${column.up.join('.')}|`;
  }
  key += `#${board.stock.join('.')}%${String.fromCodePoint(48 + board.completed)}`;
  return key;
}

/** `stock.deal` needs every column non-empty — exactly the engine's own gate. */
function canDeal(board: Board): boolean {
  return (
    board.stock.length >= STOCK_DEAL &&
    board.tableau.every((column) => column.down.length > 0 || column.up.length > 0)
  );
}

/** Rank-1 descent regardless of suit — the engine's placement rule. */
function canPlace(card: string, target: string | null): boolean {
  if (target === null) return true;
  return rankOfCard(card) === rankOfCard(target) - 1;
}

function applySolverMove(board: Board, move: SolverMove): Board {
  const next = cloneBoard(board);
  if (move.kind === 'stockDeal') {
    for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      const card = next.stock.pop()!;
      next.tableau[columnIndex]!.up.push(card);
    }
    for (const column of next.tableau) {
      next.completed += clearColumn(column);
    }
    return next;
  }

  const source = next.tableau[move.from]!;
  const index = source.up.indexOf(move.card);
  const run = source.up.splice(index);
  next.tableau[move.to]!.up.push(...run);
  next.completed += clearColumn(next.tableau[move.to]!);
  if (source.up.length === 0 && source.down.length > 0) {
    source.up.push(source.down.pop()!);
    next.completed += clearColumn(source);
  }
  next.completed += clearColumn(source);
  return next;
}

function generateMoves(board: Board): SolverMove[] {
  const moves: SolverMove[] = [];
  if (canDeal(board)) moves.push({ kind: 'stockDeal' });

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const source = board.tableau[from]!;
    if (source.up.length === 0) continue;
    // Only the full packed suffix is offered — lifting a mid-run chunk once
    // produced ~104-deep trees of useless re-parking at this branch factor.
    const start = packedStart(source.up);
    const run = source.up.slice(start);
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      if (to === from) continue;
      if (!canPlace(run[0]!, board.tableau[to]!.up.at(-1) ?? null)) continue;
      moves.push({ kind: 'tableauMove', from, card: run[0]!, to });
    }
  }
  return moves;
}

/** First index of the longest same-suit packed suffix of `up` (0 when whole). */
function packedStart(up: readonly string[]): number {
  if (up.length === 0) return 0;
  let firstAt = up.length - 1;
  while (firstAt > 0) {
    const above = up[firstAt - 1]!;
    const below = up[firstAt]!;
    if (rankOfCard(below) !== rankOfCard(above) - 1) break;
    if (suitOfCard(below) !== suitOfCard(above)) break;
    firstAt--;
  }
  return firstAt;
}

/**
 * How promising a position looks: completed runs bought out, hidden cards
 * still buried, empty columns free, and un-packed face-up cards still
 * running down. There is no safe drain in Spider, so the burden of un-packed
 * cards is the only forward pull the search ranks on.
 */
function evaluate(board: Board, weights: SolveWeights): number {
  let hidden = 0;
  let empty = 0;
  let burden = 0;
  for (const column of board.tableau) {
    hidden += column.down.length;
    if (column.down.length === 0 && column.up.length === 0) empty++;
    burden += packedStart(column.up);
  }
  return (
    board.completed * weights.complete +
    empty * weights.emptyColumn -
    hidden * weights.hidden -
    burden * weights.burden
  );
}

/**
 * One-move shape credit: completion and uncovering dwarf everything, and
 * same-suit placements beat sideways shuffles. Used for MOVE ORDER ONLY —
 * never added into a node's score, because that made uncover-spam rank with
 * genuine completions and fooled the frontier into wandering.
 */
/** Orders moves within one node by shape credit; the heap ranks states. */
function orderedMoves(board: Board, moves: SolverMove[]): SolverMove[] {
  const ranked = moves.map((move) => {
    let bias = 0;
    if (move.kind === 'stockDeal') {
      bias = 0;
    } else {
      const source = board.tableau[move.from]!;
      // the whole `up` moves when its packed suffix starts at 0
      const uncovers = source.down.length > 0 && source.up.indexOf(move.card) === 0;
      const dest = board.tableau[move.to]!;
      const headSuit = suitOfCard(move.card);
      const sameSuit = dest.up.length > 0 && suitOfCard(dest.up.at(-1)!) === headSuit;
      bias = uncovers ? 200 : sameSuit ? 120 : 20;
    }
    return { move, bias };
  });
  ranked.sort((left, right) => right.bias - left.bias);
  return ranked.map((entry) => entry.move);
}

interface Frontier {
  board: Board;
  score: number;
  depth: number;
  seq: number;
  trail: number;
}

/** A move and the step it followed, forming a backwards-linked search path. */
interface TrailStep {
  move: SolverMove;
  parent: number;
}

function better(left: Frontier, right: Frontier): boolean {
  return left.score !== right.score ? left.score > right.score : left.seq < right.seq;
}

/** Plain binary max-heap, identical to the Klondike/FreeCell one. */
class FrontierHeap {
  private readonly items: Frontier[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: Frontier): void {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!better(items[index]!, items[parent]!)) break;
      [items[index], items[parent]] = [items[parent]!, items[index]!];
      index = parent;
    }
  }

  pop(): Frontier | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || last === undefined) return top;
    items[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < items.length && better(items[left]!, items[best]!)) best = left;
      if (right < items.length && better(items[right]!, items[best]!)) best = right;
      if (best === index) break;
      [items[index], items[best]] = [items[best]!, items[index]!];
      index = best;
    }
    return top;
  }
}

/**
 * Walks a Spider deal looking for a winning line. See {@link SolveOutcome}
 * for the guarantees. Same best-first discipline as the FreeCell/Klondike
 * solvers; the frontier stores live boards because decoding Spider's long
 * ids back out of a key would spend what cloning saves.
 */
export function solveSpider(state: SpiderState, options: SolveOptions = {}): SolveResult {
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const root = boardFrom(state);
  if (root.completed === FOUNDATION_SLOTS) {
    return { outcome: 'solved', nodes: 0, moves: 0, line: [] };
  }

  const trail: TrailStep[] = [];
  const seen = new Set<string>([boardKey(root)]);
  const frontier = new FrontierHeap();
  frontier.push({
    board: root,
    score: evaluate(root, weights),
    depth: 0,
    seq: 0,
    trail: -1,
  });
  let nodes = 0;
  let seq = 1;

  /** Re-walks the found path from the true root, recording game moves. */
  const lineFor = (last: SolverMove, from: number): LegalMove[] => {
    const path: SolverMove[] = [last];
    for (let step = from; step >= 0; step = trail[step]!.parent) path.push(trail[step]!.move);
    path.reverse();
    const line: LegalMove[] = [];
    let replay = boardFrom(state);
    for (const each of path) {
      replay = applySolverMove(replay, each);
      if (each.kind === 'stockDeal') {
        line.push({ id: 'stock.deal' });
      } else {
        line.push({
          id: 'tableau.move',
          payload: { from: each.from, card: each.card, to: each.to },
        });
      }
    }
    return line;
  };

  while (frontier.size > 0) {
    if (nodes >= nodeBudget) return { outcome: 'budget', nodes, moves: 0, line: [] };
    const current = frontier.pop()!;
    if (current.depth >= maxDepth) continue;
    const depth = current.depth + 1;

    for (const move of orderedMoves(current.board, generateMoves(current.board))) {
      if (nodes >= nodeBudget) break;
      const next = applySolverMove(current.board, move);
      nodes++;
      if (next.completed === FOUNDATION_SLOTS) {
        return { outcome: 'solved', nodes, moves: depth, line: lineFor(move, current.trail) };
      }
      const key = boardKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      trail.push({ move, parent: current.trail });
      frontier.push({
        board: next,
        score: evaluate(next, weights) - depth * weights.depth,
        depth,
        seq: seq++,
        trail: trail.length - 1,
      });
    }
  }

  return { outcome: nodes >= nodeBudget ? 'budget' : 'exhausted', nodes, moves: 0, line: [] };
}

/** True only when the solver actually found a winning line. */
export function isWinnableDeal(state: SpiderState, options: SolveOptions = {}): boolean {
  return solveSpider(state, options).outcome === 'solved';
}

/** Deals the table a given seed produces, without running a whole match. */
export function spiderDealFor(seed: number, suitCount: SpiderSuitCount): SpiderState {
  return createSession(spiderGame, {
    seed,
    config: spiderConfig.resolve({ suitCount } as Partial<SpiderRules>),
    seats: 1,
  }).state;
}
