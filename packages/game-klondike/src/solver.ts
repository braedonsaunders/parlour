import type { LegalMove } from '@parlour/engine';
import { DECK, SUITS, TABLEAU_COLUMNS } from './cards';
import type { KlondikeState } from './state';

/**
 * A bounded "thoughtful Klondike" solver: it sees every face-down card and looks
 * for one line that clears the table.
 *
 * It is deliberately **sound but not complete**. `solved` means the solver
 * actually walked a winning line, so it is always trustworthy. `exhausted` and
 * `budget` both mean "no proof found" — the first because the pruned search ran
 * dry, the second because it ran out of nodes — and neither proves a deal is
 * dead. Deal selection only ever accepts `solved`, so a deal we ship as winnable
 * really is winnable; the cost of the missing completeness is that we sometimes
 * discard a deal that a slower search would have cracked.
 */
export type SolveOutcome = 'solved' | 'exhausted' | 'budget';

export interface SolveResult {
  outcome: SolveOutcome;
  /** Search nodes expanded, so callers can tune the budget against real deals. */
  nodes: number;
  /** Length of the winning line in solver moves, or 0 when unsolved. */
  moves: number;
  /**
   * The winning line as ordinary game moves, empty unless `outcome` is `solved`.
   * Every entry is a move the engine accepts, which is what makes the winnable
   * guarantee checkable rather than merely argued.
   */
  line: readonly LegalMove[];
}

export interface SolveOptions {
  /** Cards turned from the stock per draw. Defaults to the deal's own rules. */
  drawCount?: 1 | 3;
  /** Hard ceiling on expanded nodes. */
  nodeBudget?: number;
  /** Hard ceiling on search depth, a backstop against pathological dives. */
  maxDepth?: number;
  /** Position scoring weights; see {@link SolveWeights}. */
  weights?: Partial<SolveWeights>;
}

/**
 * Weights for the position score that drives the search order. These are tuned
 * empirically against real deals; see {@link DEFAULT_WEIGHTS}.
 */
export interface SolveWeights {
  foundation: number;
  hidden: number;
  emptyColumn: number;
  unturned: number;
  /** Charged per move made, which keeps the search from wandering sideways. */
  depth: number;
}

/**
 * Tuned by sweep against 60 real deals of each draw rule. The depth charge is
 * the sensitive one and the curve is sharp on both sides: at 2 the search wanders
 * sideways and solves 43, at 6 it solves 49, and by 12 it has flattened into
 * breadth-first and solves 28.
 */
const DEFAULT_WEIGHTS: SolveWeights = {
  foundation: 6,
  hidden: 12,
  emptyColumn: 5,
  unturned: 1,
  depth: 6,
};

/** Proves four deals in five, about as far as Klondike itself goes, in ~75ms. */
const DEFAULT_NODE_BUDGET = 200_000;
const DEFAULT_MAX_DEPTH = 2_000;
const SUIT_COUNT = 4;
const RANK_COUNT = 13;
const CARD_COUNT = SUIT_COUNT * RANK_COUNT;
const KING = 13;

/** `stdDeck` lays out S,H,D,C in rank order, so index arithmetic replaces lookups. */
const CARD_INDEX = new Map<string, number>(DECK.cardIds.map((card, index) => [card, index]));
const RANK_OF = new Int8Array(CARD_COUNT);
const SUIT_OF = new Int8Array(CARD_COUNT);
const RED = new Uint8Array(CARD_COUNT);
for (let index = 0; index < CARD_COUNT; index++) {
  RANK_OF[index] = (index % RANK_COUNT) + 1;
  SUIT_OF[index] = Math.floor(index / RANK_COUNT);
  RED[index] = SUIT_OF[index] === 1 || SUIT_OF[index] === 2 ? 1 : 0;
}

/** One character per card keeps state keys cheap to build and cheap to hash. */
const CARD_CHAR: string[] = Array.from({ length: CARD_COUNT }, (_, index) =>
  String.fromCharCode(65 + index),
);

interface Column {
  down: number[];
  up: number[];
}

interface Board {
  tableau: Column[];
  /** Top rank per suit, 0 when the foundation is empty. */
  foundations: Int8Array;
  /** Draw takes from the end, matching the game's own stock. */
  stock: number[];
  waste: number[];
}

/**
 * Waste plays carry the stock turns that expose them. Turning the stock never
 * touches the tableau, so a bare draw is only ever worth making for the card it
 * uncovers — bundling the two means the search never has to store the dozens of
 * mid-cycle positions that differ from each other by nothing a player can use.
 */
type SolverMove =
  | { kind: 'wasteToFoundation'; turns: number }
  | { kind: 'wasteToTableau'; turns: number; to: number }
  | { kind: 'tableauToFoundation'; from: number }
  | { kind: 'tableauMove'; from: number; at: number; to: number }
  | { kind: 'foundationToTableau'; suit: number; to: number };

function cardIndex(card: string): number {
  const index = CARD_INDEX.get(card);
  if (index === undefined) throw new Error(`solver: ${card} is not a standard deck card`);
  return index;
}

function boardFrom(state: KlondikeState): Board {
  const foundations = new Int8Array(SUIT_COUNT);
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    foundations[suit] = state.foundations[suits[suit]!].length;
  }
  return {
    tableau: state.tableau.map((column) => ({
      down: column.down.map(cardIndex),
      up: column.up.map(cardIndex),
    })),
    foundations,
    stock: state.stock.map(cardIndex),
    waste: state.waste.map(cardIndex),
  };
}

function cloneBoard(board: Board): Board {
  return {
    tableau: board.tableau.map((column) => ({ down: column.down.slice(), up: column.up.slice() })),
    foundations: board.foundations.slice(),
    stock: board.stock.slice(),
    waste: board.waste.slice(),
  };
}

function foundationTotal(board: Board): number {
  let total = 0;
  for (let suit = 0; suit < SUIT_COUNT; suit++) total += board.foundations[suit]!;
  return total;
}

function fitsTableau(card: number, target: number | undefined): boolean {
  if (target === undefined) return RANK_OF[card] === KING;
  return RANK_OF[card] === RANK_OF[target]! - 1 && RED[card] !== RED[target];
}

function fitsFoundation(board: Board, card: number): boolean {
  return board.foundations[SUIT_OF[card]!]! === RANK_OF[card]! - 1;
}

/**
 * The classic safe-autoplay test: a card is safe once nothing left in play could
 * still need it as a tableau target. Playing safe cards eagerly never loses a
 * winnable deal and collapses a huge amount of pointless branching.
 */
function isSafeToPlay(board: Board, card: number): boolean {
  const rank = RANK_OF[card]!;
  if (rank <= 2) return true;
  const suit = SUIT_OF[card]!;
  // Opposite colours are what this card could still be stacked on top of.
  const opposite = RED[card] === 1 ? [0, 3] : [1, 2];
  const sameColourOther = RED[card] === 1 ? (suit === 1 ? 2 : 1) : suit === 0 ? 3 : 0;
  for (const other of opposite) {
    if (board.foundations[other]! < rank - 1) return false;
  }
  return board.foundations[sameColourOther]! >= rank - 2;
}

function flipIfNeeded(column: Column): void {
  if (column.up.length === 0 && column.down.length > 0) column.up.push(column.down.pop()!);
}

/**
 * Drains every safe foundation play, including the ones each play unlocks.
 *
 * `line`, when given, collects the equivalent game moves. The search itself never
 * passes it — recording a line for every position explored would cost far more
 * than the search — so it is filled in on a second pass once a win is found.
 */
function autoplaySafe(board: Board, line?: LegalMove[]): void {
  for (let progress = true; progress;) {
    progress = false;
    for (let index = 0; index < board.tableau.length; index++) {
      const column = board.tableau[index]!;
      const card = column.up.at(-1);
      if (card === undefined || !fitsFoundation(board, card) || !isSafeToPlay(board, card))
        continue;
      column.up.pop();
      board.foundations[SUIT_OF[card]!]!++;
      flipIfNeeded(column);
      line?.push({ id: 'tableau.toFoundation', payload: { from: index } });
      progress = true;
    }
    const wasteCard = board.waste.at(-1);
    if (
      wasteCard !== undefined &&
      fitsFoundation(board, wasteCard) &&
      isSafeToPlay(board, wasteCard)
    ) {
      board.waste.pop();
      board.foundations[SUIT_OF[wasteCard]!]!++;
      line?.push({ id: 'waste.toFoundation' });
      progress = true;
    }
  }
}

/**
 * Encodes a position, one character per card.
 *
 * The key is lossless and keeps the columns where they are, so the frontier can
 * hold these strings instead of live boards — a tenth of the memory, and the
 * column a move names still means the same column when the winning line is
 * replayed. Folding permuted columns together would dedupe a little more, but
 * `destinationSlots` already refuses to generate the moves that produce them.
 */
function boardKey(board: Board): string {
  const columns: string[] = [];
  for (const column of board.tableau) {
    let encoded = '';
    for (const card of column.down) encoded += CARD_CHAR[card];
    encoded += '/';
    for (const card of column.up) encoded += CARD_CHAR[card];
    columns.push(encoded);
  }
  let key = columns.join('|');
  key += '!';
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    key += String.fromCharCode(48 + board.foundations[suit]!);
  }
  key += '#';
  for (const card of board.stock) key += CARD_CHAR[card];
  key += '#';
  for (const card of board.waste) key += CARD_CHAR[card];
  return key;
}

function cardsFrom(encoded: string): number[] {
  const cards: number[] = [];
  for (let index = 0; index < encoded.length; index++) {
    cards.push(encoded.charCodeAt(index) - 65);
  }
  return cards;
}

/** Inverse of {@link boardKey}, up to the column reordering the key normalises. */
function boardFromKey(key: string): Board {
  const split = key.indexOf('!');
  const tableau = key
    .slice(0, split)
    .split('|')
    .map((column) => {
      const parts = column.split('/');
      return { down: cardsFrom(parts[0]!), up: cardsFrom(parts[1]!) };
    });
  const rest = key.slice(split + 1);
  const foundations = new Int8Array(SUIT_COUNT);
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    foundations[suit] = rest.charCodeAt(suit) - 48;
  }
  const piles = rest.slice(SUIT_COUNT + 1).split('#');
  return { tableau, foundations, stock: cardsFrom(piles[0]!), waste: cardsFrom(piles[1]!) };
}

/** One stock turn: a draw, or the recycle that has to come first when it is out. */
function turnStock(board: Board, drawCount: number, line?: LegalMove[]): void {
  if (board.stock.length === 0) {
    board.stock = board.waste.slice().reverse();
    board.waste = [];
    line?.push({ id: 'stock.recycle' });
    return;
  }
  const count = Math.min(drawCount, board.stock.length);
  for (let index = 0; index < count; index++) board.waste.push(board.stock.pop()!);
  line?.push({ id: 'stock.draw' });
}

function applySolverMove(
  board: Board,
  move: SolverMove,
  drawCount: number,
  line?: LegalMove[],
): Board {
  const next = cloneBoard(board);
  switch (move.kind) {
    case 'wasteToFoundation': {
      for (let turn = 0; turn < move.turns; turn++) turnStock(next, drawCount, line);
      const card = next.waste.pop()!;
      next.foundations[SUIT_OF[card]!]!++;
      line?.push({ id: 'waste.toFoundation' });
      break;
    }
    case 'wasteToTableau': {
      for (let turn = 0; turn < move.turns; turn++) turnStock(next, drawCount, line);
      next.tableau[move.to]!.up.push(next.waste.pop()!);
      line?.push({ id: 'waste.toTableau', payload: { to: move.to } });
      break;
    }
    case 'tableauToFoundation': {
      const column = next.tableau[move.from]!;
      const card = column.up.pop()!;
      next.foundations[SUIT_OF[card]!]!++;
      flipIfNeeded(column);
      line?.push({ id: 'tableau.toFoundation', payload: { from: move.from } });
      break;
    }
    case 'tableauMove': {
      const source = next.tableau[move.from]!;
      const head = source.up[move.at]!;
      const run = source.up.splice(move.at);
      next.tableau[move.to]!.up.push(...run);
      flipIfNeeded(source);
      line?.push({
        id: 'tableau.move',
        payload: { from: move.from, card: DECK.cardIds[head]!, to: move.to },
      });
      break;
    }
    case 'foundationToTableau': {
      const rank = next.foundations[move.suit]!;
      next.foundations[move.suit]!--;
      next.tableau[move.to]!.up.push(move.suit * RANK_COUNT + rank - 1);
      line?.push({ id: 'foundation.toTableau', payload: { suit: SUITS[move.suit]!, to: move.to } });
      break;
    }
  }
  autoplaySafe(next, line);
  return next;
}

/**
 * Two columns whose top face-up cards share a rank and colour accept exactly the
 * same runs, and every bare column is interchangeable. Offering only one of each
 * keeps the branching factor down to the moves that are actually distinct — the
 * single biggest lever the search has, because the cost of a wide node compounds
 * at every level below it.
 */
function destinationSlots(board: Board): number[] {
  const slots: number[] = [];
  const kinds = new Set<number>();
  let tookEmpty = false;
  for (let to = 0; to < TABLEAU_COLUMNS; to++) {
    const column = board.tableau[to]!;
    const top = column.up.at(-1);
    if (top === undefined) {
      // A bare column and one still holding face-down cards are not the same
      // thing: only the first can be left empty for good.
      if (column.down.length > 0) {
        slots.push(to);
        continue;
      }
      if (tookEmpty) continue;
      tookEmpty = true;
      slots.push(to);
      continue;
    }
    const kind = RANK_OF[top]! * 2 + RED[top]!;
    if (kinds.has(kind)) continue;
    kinds.add(kind);
    slots.push(to);
  }
  return slots;
}

/**
 * Moves come out best-first: uncovering face-down cards and freeing columns are
 * what actually progresses a deal, so the search tries those before it starts
 * shuffling runs sideways.
 */
function generateMoves(board: Board, drawCount: number): SolverMove[] {
  const scored: { move: SolverMove; score: number }[] = [];
  const push = (move: SolverMove, score: number) => scored.push({ move, score });
  const slots = destinationSlots(board);

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const source = board.tableau[from]!;
    if (source.up.length === 0) continue;
    const top = source.up.at(-1)!;
    if (fitsFoundation(board, top)) push({ kind: 'tableauToFoundation', from }, 40);

    // Only the packed suffix can be lifted, so walk back from the last card to
    // find where that run starts rather than assuming the column is one run.
    let firstAt = source.up.length - 1;
    while (firstAt > 0) {
      const above = source.up[firstAt - 1]!;
      const below = source.up[firstAt]!;
      if (RANK_OF[below] !== RANK_OF[above]! - 1 || RED[below] === RED[above]) break;
      firstAt--;
    }

    for (let at = firstAt; at < source.up.length; at++) {
      // Splitting a run only ever buys the card it exposes. Unless that card can
      // go straight to a foundation, the split leaves the table strictly worse
      // off than moving the whole run, so it is not worth a branch.
      if (at > firstAt && !fitsFoundation(board, source.up[at - 1]!)) continue;
      const head = source.up[at]!;
      const wholeColumn = at === 0;
      const uncovers = wholeColumn && source.down.length > 0;
      const empties = wholeColumn && source.down.length === 0;
      for (const to of slots) {
        if (to === from) continue;
        const destination = board.tableau[to]!;
        if (!fitsTableau(head, destination.up.at(-1))) continue;
        // Sliding a lone king between bare columns changes nothing.
        if (empties && destination.up.length === 0 && destination.down.length === 0) continue;
        const score = uncovers ? 90 + source.down.length : empties ? 60 : 20;
        push({ kind: 'tableauMove', from, at, to }, score);
      }
    }
  }

  // Walk one lap of the stock. Past a full lap the same cards come round again,
  // and the only way to reach the ones in between is to play one first — which
  // this generator will offer again from the position that play leaves behind.
  const cycle: Board = { ...board, stock: board.stock.slice(), waste: board.waste.slice() };
  const lap = Math.ceil((board.stock.length + board.waste.length) / drawCount) + 2;
  for (let turns = 0; turns <= lap; turns++) {
    if (turns > 0) {
      if (cycle.stock.length === 0 && cycle.waste.length === 0) break;
      turnStock(cycle, drawCount);
    }
    const wasteCard = cycle.waste.at(-1);
    if (wasteCard === undefined) continue;
    // Later turns cost more table time, so break ties toward the nearer card.
    const reach = Math.max(0, 12 - turns);
    if (fitsFoundation(board, wasteCard)) push({ kind: 'wasteToFoundation', turns }, 30 + reach);
    for (const to of slots) {
      if (fitsTableau(wasteCard, board.tableau[to]!.up.at(-1))) {
        push({ kind: 'wasteToTableau', turns, to }, 45 + reach);
      }
    }
  }

  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    const rank = board.foundations[suit]!;
    if (rank === 0) continue;
    const card = suit * RANK_COUNT + rank - 1;
    for (const to of slots) {
      const destination = board.tableau[to]!;
      // Pulling a card back out is only ever worth it as a tableau target, so
      // never onto a bare column and never onto a column it cannot help.
      if (destination.up.length === 0) continue;
      if (fitsTableau(card, destination.up.at(-1))) {
        push({ kind: 'foundationToTableau', suit, to }, 5);
      }
    }
  }

  scored.sort((left, right) => right.score - left.score);
  return scored.map((entry) => entry.move);
}

/**
 * How promising a position looks. Face-down cards outrank foundation progress
 * here on purpose: a deal is lost when the tableau seizes up, and racing cards
 * onto the foundations is the classic way to strip away the low targets the
 * tableau still needs. Bare columns are the most valuable space on the table.
 */
function evaluate(board: Board, weights: SolveWeights): number {
  let hidden = 0;
  let empty = 0;
  for (const column of board.tableau) {
    hidden += column.down.length;
    if (column.down.length === 0 && column.up.length === 0) empty++;
  }
  return (
    foundationTotal(board) * weights.foundation -
    hidden * weights.hidden +
    empty * weights.emptyColumn -
    (board.stock.length + board.waste.length) * weights.unturned
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

/** Plain binary max-heap; a re-sorted array would spend the whole budget sorting. */
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
 * Walks a deal looking for a winning line. See {@link SolveOutcome} for the
 * guarantees.
 *
 * The search is best-first, not depth-first. Klondike punishes depth-first
 * badly: one early wrong turn buries the search in a subtree of millions of dead
 * positions, and since the transposition table won't let it revisit anything,
 * the budget is long gone before it backs out. Best-first drops a line the
 * moment it stops looking better than the alternatives, and because the frontier
 * holds keys rather than live boards it stays cheap to keep thousands of them.
 */
export function solveKlondike(state: KlondikeState, options: SolveOptions = {}): SolveResult {
  const drawCount = options.drawCount ?? state.rules.drawCount;
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  const root = boardFrom(state);
  const opening: LegalMove[] = [];
  autoplaySafe(root, opening);
  if (foundationTotal(root) === CARD_COUNT) {
    return { outcome: 'solved', nodes: 0, moves: 0, line: opening };
  }

  // The trail only stores a move and a back-pointer per node, so keeping the
  // whole search path costs a pointer rather than a board.
  const trail: TrailStep[] = [];
  const rootKey = boardKey(root);
  const seen = new Set<string>([rootKey]);
  const frontier = new FrontierHeap();
  frontier.push({ key: rootKey, score: evaluate(root, weights), depth: 0, seq: 0, trail: -1 });
  let nodes = 0;
  let seq = 1;

  /** Re-walks the found path from the true root, this time recording game moves. */
  const lineFor = (last: SolverMove, from: number): LegalMove[] => {
    const path: SolverMove[] = [last];
    for (let step = from; step >= 0; step = trail[step]!.parent) path.push(trail[step]!.move);
    path.reverse();
    const line = opening.slice();
    let board = boardFrom(state);
    autoplaySafe(board);
    for (const move of path) board = applySolverMove(board, move, drawCount, line);
    return line;
  };

  while (frontier.size > 0) {
    if (nodes >= nodeBudget) return { outcome: 'budget', nodes, moves: 0, line: [] };
    const current = frontier.pop()!;
    if (current.depth >= maxDepth) continue;
    const board = boardFromKey(current.key);
    const depth = current.depth + 1;

    for (const move of generateMoves(board, drawCount)) {
      if (nodes >= nodeBudget) break;
      const next = applySolverMove(board, move, drawCount);
      nodes++;
      if (foundationTotal(next) === CARD_COUNT) {
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

/** True only when the solver actually found a winning line. */
export function isWinnableDeal(state: KlondikeState, options: SolveOptions = {}): boolean {
  return solveKlondike(state, options).outcome === 'solved';
}
