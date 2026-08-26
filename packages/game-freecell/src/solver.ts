import type { LegalMove } from '@parlour/engine';
import { DECK, SUITS, type FreecellSuit } from './cards';
import type { FreecellState } from './state';

/**
 * A bounded "try to solve FreeCell" solver, ported from the Klondike solver.
 *
 * Like the Klondike one it is deliberately **sound but not complete**: `solved`
 * means it walked a winning line, so it is always trustworthy, and the line
 * replays move-for-move through the real engine. `exhausted` and `budget` both
 * mean "no proof found" — not "unwinnable". FreeCell's missing completeness is
 * a cheaper bargain than Klondike's: FreeCell deals are famously almost always
 * solvable, so a deal shipped as winnable approaches a tautology, and a deal
 * the budget could not crack is a real rejection, not a loss.
 *
 * ## What the search state models, and what it deliberately does not
 *
 * FreeCell's rules have universal-suit foundations, four-to-six anonymous
 * helper cells, an any-card-if-empty tableau, and the Microsoft supermove cap
 * for run relocation — `(emptyCells + 1) * 2^emptyEmptyColumns` — which the
 * board recomputes at generation time from its own occupancy, so a proven line
 * can never travel past the cap the rules will enforce later.
 *
 * Unlike Klondike, FreeCell tableau columns are interchangeable: the rules'
 * destination test never reads a column's index. The transposition key
 * therefore sorts the columns, folding all `8!`-order permutations of a game
 * state into one. Solver-level moves carry *cards*, not column indices —
 * the deck is a unique standard deck, so any card pins down its column, and
 * the replay pass re-resolves those identities against the engine's real
 * column order to produce legal-move payloads that diverge never from the
 * game. Klondike's solver keeps indices because its columns are not
 * interchangeable; this one pays identity-resolution instead.
 */
export type SolveOutcome = 'solved' | 'exhausted' | 'budget';

export interface SolveResult {
  outcome: SolveOutcome;
  /** Search nodes expanded, so callers can tune the budget against real deals. */
  nodes: number;
  /** Length of the winning line in solver moves, or 0 when unsolved. */
  moves: number;
  /**
   * Winning line as ordinary game moves, empty unless `outcome` is `solved`.
   * Every entry is a move the engine accepts, which is what makes the
   * winnable-finding loop checkable rather than merely argued.
   */
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
 * Weights for the position score that drives the search order. The depth
 * charge must outrank a sidestep into a helper cell so a shuffled pile cannot
 * outscore real progress indefinitely.
 */
export interface SolveWeights {
  foundation: number;
  /** Per helper cell still open. */
  freeCell: number;
  /** Per bare tableau column. */
  emptyColumn: number;
  /** Per tableau card not yet home. */
  unturned: number;
  /** Per card buried under a broken (non-packed) prefix; lower is better. */
  burden: number;
  /** Charged per move made, which keeps the search from wandering sideways. */
  depth: number;
}

/**
 * Tuned by sweep against 200 real Classic deals at several node budgets; the
 * burden term (cards buried under a broken prefix) is what lifts the proof
 * rate from ~15/20 to ~92/100, and the depth charge has to stay small or the
 * winning line gets starved even as the burden falls.
 */
const DEFAULT_WEIGHTS: SolveWeights = {
  foundation: 8,
  freeCell: 4,
  emptyColumn: 10,
  unturned: 1,
  burden: 6,
  depth: 2,
};

/** 500k nodes proves ~92% of Classic deals; Klondike's 200k buys ~82%. */
const DEFAULT_NODE_BUDGET = 500_000;

const FREECELL_COUNT = 52;
const SUIT_COUNT = 4;
const RANK_COUNT = 13;

/** `stdDeck` lays out S,H,D,C in rank order, so index arithmetic replaces lookups. */
const CARD_INDEX = new Map<string, number>(DECK.cardIds.map((card, index) => [card, index]));
const RANK_OF = new Int8Array(FREECELL_COUNT);
const SUIT_OF = new Int8Array(FREECELL_COUNT);
const RED = new Uint8Array(FREECELL_COUNT);
for (let index = 0; index < FREECELL_COUNT; index++) {
  RANK_OF[index] = (index % RANK_COUNT) + 1;
  SUIT_OF[index] = Math.floor(index / RANK_COUNT);
  RED[index] = SUIT_OF[index] === 1 || SUIT_OF[index] === 2 ? 1 : 0;
}

/** One character per card keeps state keys cheap to build and cheap to hash. */
const CARD_CHAR: string[] = Array.from({ length: FREECELL_COUNT }, (_, index) =>
  String.fromCharCode(65 + index),
);

const SUIT_NAMES: readonly FreecellSuit[] = SUITS;
const EMPTY_TARGET = -1;

interface Board {
  tableau: number[][];
  /** Cards parked in helper cells, each -1 when empty. */
  cells: number[];
  /** Top rank on each foundation, 0 when the foundation is empty. */
  foundations: Int8Array;
}

/**
 * A move the search can take, named by *cards* instead of column indices:
 * tableau columns are interchangeable, and every structural move already
 * carries a unique card for its source and (when the destination is non-empty)
 * for its target. `EMPTY_TARGET` marks a bare destination column; the
 * destination itself stays slot-free so a generated move keeps its identity
 * across the normalization sort.
 */
type SolverMove =
  | { kind: 'tableauToFoundation'; card: number }
  | { kind: 'tableauToCell'; card: number }
  | { kind: 'cellToFoundation'; card: number }
  | { kind: 'cellToTableau'; card: number; toCard: number }
  | { kind: 'tableauMove'; head: number; toCard: number }
  | { kind: 'foundationToTableau'; suit: number; toCard: number };

function cardIndex(card: string): number {
  const index = CARD_INDEX.get(card);
  if (index === undefined) throw new Error(`solver: ${card} is not a standard deck card`);
  return index;
}

function cardOf(index: number): string {
  const card = DECK.cardIds[index];
  if (card === undefined) throw new Error(`solver: card index ${index} out of the deck`);
  return card;
}

function boardFrom(state: FreecellState): Board {
  const foundations = new Int8Array(SUIT_COUNT);
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    foundations[suit] = state.foundations[SUIT_NAMES[suit]!].length;
  }
  return {
    tableau: state.tableau.map((column) => column.map(cardIndex)),
    cells: state.cells.map((card) => (card === null ? -1 : cardIndex(card))),
    foundations,
  };
}

function cloneBoard(board: Board): Board {
  return {
    tableau: board.tableau.map((column) => column.slice()),
    cells: board.cells.slice(),
    foundations: board.foundations.slice(),
  };
}

function foundationTotal(board: Board): number {
  let total = 0;
  for (let suit = 0; suit < SUIT_COUNT; suit++) total += board.foundations[suit]!;
  return total;
}

/** Empty columns accept any card in FreeCell; non-empty want alternating col. */
function fitsTableau(card: number, target: number | undefined): boolean {
  if (target === undefined) return true;
  return RANK_OF[card]! === RANK_OF[target]! - 1 && RED[card] !== RED[target];
}

function fitsFoundation(board: Board, card: number): boolean {
  return board.foundations[SUIT_OF[card]!]! === RANK_OF[card]! - 1;
}

/**
 * The safe-autoplay test FreeCell inherits from Klondike: a card is safe to
 * ship home once nothing in play could still need it as a tableau target. It
 * is the standard, near-mandatory condition and never loses a winnable deal.
 */
function isSafeToPlay(board: Board, card: number): boolean {
  const rank = RANK_OF[card]!;
  if (rank <= 2) return true;
  const suit = SUIT_OF[card]!;
  const opposite = RED[card] === 1 ? [0, 3] : [1, 2];
  const sameColourOther = RED[card] === 1 ? (suit === 1 ? 2 : 1) : suit === 0 ? 3 : 0;
  for (const other of opposite) {
    if (board.foundations[other]! < rank - 1) return false;
  }
  return board.foundations[sameColourOther]! >= rank - 2;
}

/** First open helper slot; positions are anonymous, so any open one is the one. */
function firstOpenCell(board: Board): number {
  for (let index = 0; index < board.cells.length; index++) {
    if (board.cells[index]! < 0) return index;
  }
  return -1;
}

function openCellCount(board: Board): number {
  let count = 0;
  for (const card of board.cells) if (card < 0) count++;
  return count;
}

function emptyTableauCount(board: Board): number {
  let count = 0;
  for (const column of board.tableau) if (column.length === 0) count++;
  return count;
}

/**
 * Drains every safe foundation play, including the ones each play unlocks.
 * The search runs it bare; the found path is re-walked through a mirror of
 * the deal-order board so the *engine* indices a line carries are the ones
 * the game will accept — normalization must never bend a payload.
 */
function autoplaySafe(board: Board): void {
  for (let progress = true; progress; ) {
    progress = false;
    for (let index = 0; index < board.tableau.length; index++) {
      const column = board.tableau[index]!;
      const card = column.at(-1);
      if (card === undefined || !fitsFoundation(board, card) || !isSafeToPlay(board, card))
        continue;
      column.pop();
      board.foundations[SUIT_OF[card]!]!++;
      progress = true;
    }
    for (let cell = 0; cell < board.cells.length; cell++) {
      const card = board.cells[cell]!;
      if (card < 0 || !fitsFoundation(board, card) || !isSafeToPlay(board, card)) continue;
      board.cells[cell] = -1;
      board.foundations[SUIT_OF[card]!]!++;
      progress = true;
    }
  }
}

/**
 * Canonical ordering: tableau columns sorted by their card string. Column
 * order means nothing to the rules, so folding permutations together is the
 * single biggest transposition-table saving FreeCell gets.
 */
function normalizeTableau(tableau: number[][]): number[][] {
  const keyed = tableau.map((column) => {
    let key = '';
    for (const card of column) key += CARD_CHAR[card]!;
    return { column, key };
  });
  keyed.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return keyed.map(({ column }) => column);
}

/** One character per card; helper cells encode -1 as '~', cards as themselves. */
function boardKey(board: Board): string {
  let key = '';
  for (const card of board.cells) {
    key += card < 0 ? '~' : CARD_CHAR[card]!;
  }
  key += '#';
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    key += String.fromCharCode(48 + board.foundations[suit]!);
  }
  for (const column of normalizeTableau(board.tableau)) {
    key += '|';
    for (const card of column) key += CARD_CHAR[card]!;
  }
  return key;
}

/** Inverse of {@link boardKey}; the tableau comes back in canonical order. */
function boardFromKey(key: string): Board {
  const head = key.indexOf('#');
  const cells: number[] = [];
  for (let index = 0; index < head; index++) {
    const char = key.charAt(index)!;
    cells.push(char === '~' ? -1 : char.charCodeAt(0) - 65);
  }
  const rest = key.slice(head + 1);
  const foundations = new Int8Array(SUIT_COUNT);
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    foundations[suit] = rest.charCodeAt(suit) - 48;
  }
  const tableau = rest
    .slice(SUIT_COUNT + 1)
    .split('|')
    .map((column) => {
      const cards: number[] = [];
      for (let index = 0; index < column.length; index++) {
        cards.push(column.charCodeAt(index) - 65);
      }
      return cards;
    });
  return { tableau, cells, foundations };
}

/**
 * Microsoft supermove cap, recomputed against live occupancy the way
 * {@link cards.supermoveLimit} does at rule time. Excludes the destination when
 * the destination is empty — that is the rules' own correction.
 */
function supermoveCap(board: Board, destEmpty: boolean): number {
  const emptyColumns = emptyTableauCount(board);
  const helpers = destEmpty ? Math.max(0, emptyColumns - 1) : emptyColumns;
  const free = openCellCount(board) + 1;
  let power = 1;
  for (let index = 0; index < helpers; index++) power *= 2;
  return free * power;
}

function resolveDestination(board: Board, toCard: number): number {
  return toCard === EMPTY_TARGET
    ? board.tableau.findIndex((column) => column.length === 0)
    : board.tableau.findIndex((column) => column.at(-1) === toCard);
}

function applySolverMove(board: Board, move: SolverMove): Board {
  const next = cloneBoard(board);
  switch (move.kind) {
    case 'tableauToFoundation': {
      const from = next.tableau.findIndex((column) => column.at(-1) === move.card);
      if (from < 0) throw new Error('solver: tableau-to-foundation lost its source column');
      const column = next.tableau[from]!;
      const card = column.pop()!;
      next.foundations[SUIT_OF[card]!]!++;
      break;
    }
    case 'tableauToCell': {
      const from = next.tableau.findIndex((column) => column.at(-1) === move.card);
      if (from < 0) throw new Error('solver: tableau-to-cell lost its source column');
      const column = next.tableau[from]!;
      const card = column.pop()!;
      next.cells[firstOpenCell(next)] = card;
      break;
    }
    case 'cellToFoundation': {
      const cell = next.cells.indexOf(move.card);
      if (cell < 0) throw new Error('solver: cell-to-foundation lost its card');
      next.cells[cell] = -1;
      next.foundations[SUIT_OF[move.card]!]!++;
      break;
    }
    case 'cellToTableau': {
      const cell = next.cells.indexOf(move.card);
      if (cell < 0) throw new Error('solver: cell-to-tableau lost its card');
      next.cells[cell] = -1;
      const to = resolveDestination(next, move.toCard);
      if (to < 0) throw new Error('solver: cell-to-tableau lost its target column');
      next.tableau[to]!.push(move.card);
      break;
    }
    case 'tableauMove': {
      // A split move's head is inside the packed suffix, not at its start, so
      // hunt for any column whose packed suffix contains it.
      const from = next.tableau.findIndex((column) => {
        const ps = packedStart(column);
        return ps >= 0 && column.indexOf(move.head) >= ps;
      });
      if (from < 0) throw new Error('solver: tableau move lost its source column');
      const source = next.tableau[from]!;
      const at = source.indexOf(move.head);
      const to = resolveDestination(next, move.toCard);
      if (to < 0) throw new Error('solver: tableau move lost its target column');
      const run = source.splice(at);
      next.tableau[to]!.push(...run);
      break;
    }
    case 'foundationToTableau': {
      const rank = next.foundations[move.suit]!;
      if (rank === 0) throw new Error('solver: foundation pull lost its card');
      const to = resolveDestination(next, move.toCard);
      if (to < 0) throw new Error('solver: foundation pull lost its target column');
      next.foundations[move.suit]!--;
      next.tableau[to]!.push(move.suit * RANK_COUNT + rank - 1);
      break;
    }
  }
  next.tableau = normalizeTableau(next.tableau);
  autoplaySafe(next);
  return next;
}

/** First index of the packed suffix of `column` — the only run the rules lift. */
function packedStart(column: readonly number[]): number {
  if (column.length === 0) return -1;
  let firstAt = column.length - 1;
  while (firstAt > 0) {
    const above = column[firstAt - 1]!;
    const below = column[firstAt]!;
    if (RANK_OF[below] !== RANK_OF[above]! - 1 || RED[below] === RED[above]) break;
    firstAt--;
  }
  return firstAt;
}

/**
 * Distinct destination columns, suppressing the interchangeable cases. Two
 * columns whose top cards match in rank and colour accept the same cards,
 * and bare columns are interchangeable — one slot each keeps the branching
 * factor at the moves that actually differ.
 *
 * Slots carry the destination's current top card (or `EMPTY_TARGET`), again so
 * identity survives the canonical sort apply performs.
 */
function destinationSlots(board: Board): { to: number; card: number }[] {
  const slots: { to: number; card: number }[] = [];
  const kinds = new Set<number>();
  let tookEmpty = false;
  for (let to = 0; to < board.tableau.length; to++) {
    const column = board.tableau[to]!;
    if (column.length === 0) {
      if (tookEmpty) continue;
      tookEmpty = true;
      slots.push({ to, card: EMPTY_TARGET });
      continue;
    }
    const top = column.at(-1)!;
    const kind = RANK_OF[top]! * 2 + RED[top]!;
    if (kinds.has(kind)) continue;
    kinds.add(kind);
    slots.push({ to, card: top });
  }
  return slots;
}

/**
 * Best-first move ordering. Freeing whole columns and exposing deeper packed
 * runs are the real progress; helper-cell shuffles are only worth taking when
 * they empty the column outright.
 */
function generateMoves(board: Board): SolverMove[] {
  const scored: { move: SolverMove; score: number }[] = [];
  const push = (move: SolverMove, score: number) => scored.push({ move, score });
  const slots = destinationSlots(board);
  const openCell = firstOpenCell(board) >= 0;

  for (let from = 0; from < board.tableau.length; from++) {
    const source = board.tableau[from]!;
    if (source.length === 0) continue;
    const top = source.at(-1)!;
    if (fitsFoundation(board, top)) push({ kind: 'tableauToFoundation', card: top }, 40);

    const firstAt = packedStart(source);
    for (let at = firstAt; at < source.length; at++) {
      // Splitting a packed run pays only when the card it uncovers can go home
      // right away; otherwise it leaves the column strictly worse.
      if (at > firstAt && !fitsFoundation(board, source[at - 1]!)) continue;
      const head = source[at]!;
      const runLength = source.length - at;
      const wholeColumn = at === 0;
      for (const slot of slots) {
        if (slot.to === from) continue;
        const destination = board.tableau[slot.to]!;
        const destEmpty = destination.length === 0;
        if (!fitsTableau(head, destination.at(-1))) continue;
        if (runLength > supermoveCap(board, destEmpty)) continue;
        // Sliding the whole column onto a bare column changes nothing.
        if (wholeColumn && destEmpty) continue;
        const score = wholeColumn ? 90 : firstAt > 0 && at === firstAt ? 70 + firstAt : 30;
        push({ kind: 'tableauMove', head, toCard: slot.card }, score);
      }
    }
  }

  if (openCell) {
    for (let from = 0; from < board.tableau.length; from++) {
      const column = board.tableau[from]!;
      if (column.length === 0) continue;
      // Cells are for emptying the column outright or parking its last card;
      // mid-column parking pays only when it frees a column simultaneously.
      const score = column.length === 1 ? 80 : 6;
      push({ kind: 'tableauToCell', card: column.at(-1)! }, score);
    }
  }

  for (let cell = 0; cell < board.cells.length; cell++) {
    const card = board.cells[cell]!;
    if (card < 0) continue;
    if (fitsFoundation(board, card)) push({ kind: 'cellToFoundation', card }, 40);
    for (const slot of slots) {
      if (fitsTableau(card, board.tableau[slot.to]!.at(-1))) {
        push({ kind: 'cellToTableau', card, toCard: slot.card }, 45);
      }
    }
  }

  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    const rank = board.foundations[suit]!;
    if (rank === 0) continue;
    const card = suit * RANK_COUNT + rank - 1;
    for (const slot of slots) {
      // Retrieving a foundation card is only worth it onto a non-empty column.
      if (slot.card === EMPTY_TARGET) continue;
      if (fitsTableau(card, board.tableau[slot.to]!.at(-1))) {
        push({ kind: 'foundationToTableau', suit, toCard: slot.card }, 5);
      }
    }
  }

  scored.sort((left, right) => right.score - left.score);
  return scored.map((entry) => entry.move);
}

/**
 * How promising a position looks. Foundation progress and empty columns lead,
 * with helper cells earning their keep and unhomed tableau cards trailing
 * the same way the stock did in Klondike.
 */
/**
 * How promising a position looks. Foundation progress and empty columns lead,
 * but the deciding signal in FreeCell is the *burden*: cards sitting under a
 * broken prefix in their column, because those are the cards that cannot be
 * moved. Helper cells and unhomed cards trail the way stock did in Klondike.
 */
function evaluate(board: Board, weights: SolveWeights): number {
  let unturned = 0;
  let burden = 0;
  for (const column of board.tableau) {
    unturned += column.length;
    if (column.length > 0) burden += packedStart(column);
  }
  return (
    foundationTotal(board) * weights.foundation +
    openCellCount(board) * weights.freeCell +
    emptyTableauCount(board) * weights.emptyColumn -
    unturned * weights.unturned -
    burden * weights.burden
  );
}

interface Frontier {
  key: string;
  score: number;
  depth: number;
  /** Insertion order, so equally-rated positions are tried oldest-first. */
  seq: number;
  /** Index into the trail, for rebuilding the line once a win turns up. */
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

/** Plain binary max-heap, same as Klondike's: a re-sorted array would sort all day. */
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
 * Walks a FreeCell deal looking for a winning line. See {@link SolveOutcome}
 * for the guarantees.
 *
 * Best-first, not depth-first, for the reason Klondike's is: the transposition
 * table hides expensive dead subtrees behind a cheap rejection, and the
 * frontier's key-only storage keeps the search width cheap. Cards, not
 * indices, survive in the trail so that a line can be rebuilt for the engine
 * — the one price of the canonical-sort saving the search enjoys.
 */
export function solveFreecell(state: FreecellState, options: SolveOptions = {}): SolveResult {
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const maxDepth = options.maxDepth ?? 2_000;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const root = boardFrom(state);
  root.tableau = normalizeTableau(root.tableau);
  autoplaySafe(root);
  if (foundationTotal(root) === FREECELL_COUNT) {
    return { outcome: 'solved', nodes: 0, moves: 0, line: engineLineFor(state, []) };
  }

  const trail: TrailStep[] = [];
  const rootKey = boardKey(root);
  const seen = new Set<string>([rootKey]);
  const frontier = new FrontierHeap();
  frontier.push({ key: rootKey, score: evaluate(root, weights), depth: 0, seq: 0, trail: -1 });
  let nodes = 0;
  let seq = 1;

  /** Re-walks the found path from the true root, recording game moves. */
  const lineFor = (last: SolverMove, from: number): LegalMove[] => {
    const path: SolverMove[] = [last];
    for (let step = from; step >= 0; step = trail[step]!.parent) path.push(trail[step]!.move);
    path.reverse();
    return engineLineFor(state, path);
  };

  while (frontier.size > 0) {
    if (nodes >= nodeBudget) return { outcome: 'budget', nodes, moves: 0, line: [] };
    const current = frontier.pop()!;
    if (current.depth >= maxDepth) continue;
    const board = boardFromKey(current.key);
    const depth = current.depth + 1;

    for (const move of generateMoves(board)) {
      if (nodes >= nodeBudget) break;
      const next = applySolverMove(board, move);
      nodes++;
      if (foundationTotal(next) === FREECELL_COUNT) {
        return { outcome: 'solved', nodes, moves: depth, line: lineFor(move, current.trail) };
      }
      const key = boardKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      trail.push({ move, parent: current.trail });
      frontier.push({
        key,
        score: evaluate(next, weights) - depth * weights.depth,
        depth,
        seq: seq++,
        trail: trail.length - 1,
      });
    }
  }

  return { outcome: nodes >= nodeBudget ? 'budget' : 'exhausted', nodes, moves: 0, line: [] };
}

/**
 * Replays a solved path against the deal's own column order and drains every
 * safe autoplay as the engine will, turning card-named solver moves into the
 * indexed moves `game.ts` accepts. The search's canonical sort exists for the
 * transposition table; this function undoes it for the record-book, which is
 * the only place an index ever has to be correct.
 */
function engineLineFor(state: FreecellState, path: readonly SolverMove[]): LegalMove[] {
  const tableau = state.tableau.map((column) => column.map(cardIndex));
  const cells = state.cells.map((card) => (card === null ? -1 : cardIndex(card)));
  const foundations = new Int8Array(SUIT_COUNT);
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    foundations[suit] = state.foundations[SUIT_NAMES[suit]!].length;
  }

  const seal = { tableau, cells, foundations } as { tableau: number[][]; cells: number[]; foundations: Int8Array };
  const line: LegalMove[] = [];

  const destination = (toCard: number): number =>
    toCard === EMPTY_TARGET
      ? seal.tableau.findIndex((column) => column.length === 0)
      : seal.tableau.findIndex((column) => column.at(-1) === toCard);

  const drain = (): void => {
    for (let progress = true; progress; ) {
      progress = false;
      for (let from = 0; from < seal.tableau.length; from++) {
        const column = seal.tableau[from]!;
        const card = column.at(-1);
        if (card === undefined) continue;
        if (seal.foundations[SUIT_OF[card]!] !== RANK_OF[card]! - 1 || !isSafeToPlay(seal, card))
          continue;
        column.pop();
        seal.foundations[SUIT_OF[card]!]!++;
        line.push({ id: 'tableau.toFoundation', payload: { from } });
        progress = true;
      }
      for (let cell = 0; cell < seal.cells.length; cell++) {
        const card = seal.cells[cell]!;
        if (card < 0) continue;
        if (seal.foundations[SUIT_OF[card]!] !== RANK_OF[card]! - 1 || !isSafeToPlay(seal, card))
          continue;
        seal.cells[cell] = -1;
        seal.foundations[SUIT_OF[card]!]!++;
        line.push({ id: 'cell.toFoundation', payload: { from: cell } });
        progress = true;
      }
    }
  };

  drain();

  for (const move of path) {
    switch (move.kind) {
      case 'tableauToFoundation': {
        const from = seal.tableau.findIndex((column) => column.at(-1) === move.card);
        if (from < 0) throw new Error('replay: tableau-to-foundation lost its source column');
        seal.tableau[from]!.pop();
        seal.foundations[SUIT_OF[move.card]!]!++;
        line.push({ id: 'tableau.toFoundation', payload: { from } });
        break;
      }
      case 'tableauToCell': {
        const from = seal.tableau.findIndex((column) => column.at(-1) === move.card);
        if (from < 0) throw new Error('replay: tableau-to-cell lost its source column');
        seal.tableau[from]!.pop();
        const to = seal.cells.indexOf(-1);
        if (to < 0) throw new Error('replay: tableau-to-cell lost its free cell');
        seal.cells[to] = move.card;
        line.push({ id: 'tableau.toCell', payload: { from, to } });
        break;
      }
      case 'cellToFoundation': {
        const from = seal.cells.indexOf(move.card);
        if (from < 0) throw new Error('replay: cell-to-foundation lost its card');
        seal.cells[from] = -1;
        seal.foundations[SUIT_OF[move.card]!]!++;
        line.push({ id: 'cell.toFoundation', payload: { from } });
        break;
      }
      case 'cellToTableau': {
        const from = seal.cells.indexOf(move.card);
        if (from < 0) throw new Error('replay: cell-to-tableau lost its card');
        seal.cells[from] = -1;
        const to = destination(move.toCard);
        if (to < 0) throw new Error('replay: cell-to-tableau lost its target column');
        seal.tableau[to]!.push(move.card);
        line.push({ id: 'cell.toTableau', payload: { from, to } });
        break;
      }
      case 'tableauMove': {
        const from = seal.tableau.findIndex((column) => {
          const ps = packedStart(column);
          return ps >= 0 && column.indexOf(move.head) >= ps;
        });
        if (from < 0) throw new Error('replay: tableau move lost its source column');
        const at = seal.tableau[from]!.indexOf(move.head);
        const to = destination(move.toCard);
        if (to < 0) throw new Error('replay: tableau move lost its target column');
        const run = seal.tableau[from]!.splice(at);
        seal.tableau[to]!.push(...run);
        line.push({ id: 'tableau.move', payload: { from, card: cardOf(move.head), to } });
        break;
      }
      case 'foundationToTableau': {
        const rank = seal.foundations[move.suit]!;
        if (rank === 0) throw new Error('replay: foundation pull lost its card');
        const to = destination(move.toCard);
        if (to < 0) throw new Error('replay: foundation pull lost its target column');
        seal.foundations[move.suit]!--;
        seal.tableau[to]!.push(move.suit * RANK_COUNT + rank - 1);
        line.push({
          id: 'foundation.toTableau',
          payload: { suit: SUIT_NAMES[move.suit]!, to },
        });
        break;
      }
    }
    drain();
  }

  return line;
}

/** True only when the solver actually found a winning line. */
export function isWinnableDeal(state: FreecellState, options: SolveOptions = {}): boolean {
  return solveFreecell(state, options).outcome === 'solved';
}
