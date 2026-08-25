import {
  Fx,
  type CardId,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
} from '@parlour/engine';
import {
  COLUMN_LENGTHS,
  DECK,
  FREECELL_SEATS,
  SUITS,
  TABLEAU_COLUMNS,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  isPackedRun,
  nameOfCard,
  rankOfCard,
  suitOfCard,
  supermoveLimit,
  type FreecellSuit,
} from './cards';
import { freecellConfig, type FreecellRules } from './config';
import { freecellHowToPlay } from './howto';
import type {
  CellToCellPayload,
  CellToTableauPayload,
  FoundationToTableauPayload,
  FreecellFoundations,
  FreecellPlayerView,
  FreecellState,
  TableauMovePayload,
  TableauSourcePayload,
  TableauToCellPayload,
} from './state';

export const GAME_ID = 'freecell';

const DEAL_STAGGER_MS = 50;

export const FreecellFx = {
  CardsMove: 'freecell.cards-move',
  FoundationBuild: 'freecell.foundation-build',
  Win: 'freecell.win',
} as const;

export interface FreecellHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

function emptyFoundations(): FreecellFoundations {
  return { spades: [], hearts: [], diamonds: [], clubs: [] };
}

function foundationCount(state: Pick<FreecellState, 'foundations'>): number {
  return SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
}

function result(state: FreecellState): MatchResult | null {
  if (state.stage !== 'won' && foundationCount(state) !== DECK.cardIds.length) return null;
  return {
    winner: 0,
    rankings: [
      {
        seat: 0,
        rank: 1,
        detail: { moves: state.moves },
      },
    ],
    reason: `solved in ${state.moves} moves`,
  };
}

function phaseFor(state: FreecellState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function cellCount(state: Pick<FreecellState, 'rules' | 'cells'>): number {
  return state.rules.freeCells;
}

function validColumn(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < TABLEAU_COLUMNS;
}

function validCell(value: unknown, count: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < count;
}

function validSuit(value: unknown): value is FreecellSuit {
  return typeof value === 'string' && SUITS.includes(value as FreecellSuit);
}

function tableauMovePayload(payload: unknown): TableauMovePayload | null {
  const input = payload as Partial<TableauMovePayload> | undefined;
  return input &&
    validColumn(input.from) &&
    validColumn(input.to) &&
    input.from !== input.to &&
    typeof input.card === 'string'
    ? { from: input.from, card: input.card, to: input.to }
    : null;
}

function tableauSourcePayload(payload: unknown): TableauSourcePayload | null {
  const from = (payload as Partial<TableauSourcePayload> | undefined)?.from;
  return validColumn(from) ? { from } : null;
}

function cellToTableauPayload(payload: unknown, cells: number): CellToTableauPayload | null {
  const input = payload as Partial<CellToTableauPayload> | undefined;
  return input && validCell(input.from, cells) && validColumn(input.to)
    ? { from: input.from, to: input.to }
    : null;
}

function cellToCellPayload(payload: unknown, cells: number): CellToCellPayload | null {
  const input = payload as Partial<CellToCellPayload> | undefined;
  return input &&
    validCell(input.from, cells) &&
    validCell(input.to, cells) &&
    input.from !== input.to
    ? { from: input.from, to: input.to }
    : null;
}

function tableauToCellPayload(payload: unknown, cells: number): TableauToCellPayload | null {
  const input = payload as Partial<TableauToCellPayload> | undefined;
  return input && validColumn(input.from) && validCell(input.to, cells)
    ? { from: input.from, to: input.to }
    : null;
}

function cellSourcePayload(payload: unknown, cells: number): { from: number } | null {
  const from = (payload as Partial<{ from: number }> | undefined)?.from;
  return validCell(from, cells) ? { from } : null;
}

function foundationTargetPayload(payload: unknown): FoundationToTableauPayload | null {
  const input = payload as Partial<FoundationToTableauPayload> | undefined;
  return input && validSuit(input.suit) && validColumn(input.to)
    ? { suit: input.suit, to: input.to }
    : null;
}

function cloneTableau(tableau: readonly (readonly CardId[])[]): CardId[][] {
  return tableau.map((column) => column.slice());
}

function cloneCells(cells: readonly (CardId | null)[]): (CardId | null)[] {
  return cells.slice();
}

function emitCardsMove(ctx: MoveCtx, cards: readonly CardId[], from: string, to: string): void {
  ctx.fx.emit(FreecellFx.CardsMove, { cards: cards.slice(), from, to, dur: 220 });
}

function acceptedAction(state: FreecellState, ctx: MoveCtx): FreecellState {
  const moves = state.moves + 1;
  if (foundationCount(state) !== DECK.cardIds.length) return { ...state, moves };
  ctx.fx.emit(FreecellFx.Win, { moves }, 180);
  ctx.fx.emit(Fx.RoundEnd, { reason: 'foundations-complete' }, 260);
  return { ...state, moves, stage: 'won' };
}

function deal(ctx: Parameters<GameDef<FreecellState, FreecellRules>['setup']>[0]): FreecellState {
  const order = ctx.rng.shuffle([...DECK.cardIds]);
  const tableau = Array.from({ length: TABLEAU_COLUMNS }, (): CardId[] => []);
  let cursor = 0;
  const rows = Math.max(...COLUMN_LENGTHS);
  for (let row = 0; row < rows; row++) {
    for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      if (row >= COLUMN_LENGTHS[columnIndex]!) continue;
      const card = order[cursor++] as CardId;
      (tableau[columnIndex] as CardId[]).push(card);
      ctx.fx.emit(
        Fx.DealCard,
        {
          card,
          from: 'stock',
          to: `tableau:${columnIndex}`,
          faceDown: false,
          dur: 220,
        },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  return {
    rules: ctx.config,
    stage: 'playing',
    tableau,
    cells: Array.from({ length: ctx.config.freeCells }, () => null),
    foundations: emptyFoundations(),
    moves: 0,
  };
}

function playable(state: FreecellState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'this deal is already complete');
}

const cellToTableau: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = cellToTableauPayload(payload, cellCount(state));
    if (!input) return error('bad-cell-tableau', 'expected {from, to} with a cell and column');
    const card = state.cells[input.from];
    if (!card) return error('cell-empty', 'that free cell is empty');
    const target = state.tableau[input.to]?.at(-1) ?? null;
    return canPlaceOnTableau(card, target)
      ? true
      : error('bad-tableau-target', 'the cell card does not fit that column');
  },
  apply(state, _seat, payload, ctx) {
    const input = cellToTableauPayload(payload, cellCount(state)) as CellToTableauPayload;
    const cells = cloneCells(state.cells);
    const card = cells[input.from] as CardId;
    cells[input.from] = null;
    const tableau = cloneTableau(state.tableau);
    (tableau[input.to] as CardId[]).push(card);
    emitCardsMove(ctx, [card], `cell:${input.from}`, `tableau:${input.to}`);
    return acceptedAction({ ...state, cells, tableau }, ctx);
  },
};

const cellToFoundation: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = cellSourcePayload(payload, cellCount(state));
    if (!input) return error('bad-source', 'expected {from} with a free cell');
    const card = state.cells[input.from];
    if (!card) return error('cell-empty', 'that free cell is empty');
    const suit = suitOfCard(card);
    return suit && canPlaceOnFoundation(card, state.foundations[suit])
      ? true
      : error('bad-foundation-target', 'that card cannot move to its foundation');
  },
  apply(state, _seat, payload, ctx) {
    const input = cellSourcePayload(payload, cellCount(state)) as { from: number };
    const cells = cloneCells(state.cells);
    const card = cells[input.from] as CardId;
    cells[input.from] = null;
    const suit = suitOfCard(card) as FreecellSuit;
    const foundations = { ...state.foundations, [suit]: [...state.foundations[suit], card] };
    emitCardsMove(ctx, [card], `cell:${input.from}`, `foundation:${suit}`);
    ctx.fx.emit(FreecellFx.FoundationBuild, { suit, card, count: foundations[suit].length });
    return acceptedAction({ ...state, cells, foundations }, ctx);
  },
};

const cellToCell: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = cellToCellPayload(payload, cellCount(state));
    if (!input) return error('bad-cell-move', 'expected {from, to} with distinct free cells');
    if (!state.cells[input.from]) return error('cell-empty', 'that free cell is empty');
    return state.cells[input.to] === null
      ? true
      : error('cell-occupied', 'that free cell already holds a card');
  },
  apply(state, _seat, payload, ctx) {
    const input = cellToCellPayload(payload, cellCount(state)) as CellToCellPayload;
    const cells = cloneCells(state.cells);
    const card = cells[input.from] as CardId;
    cells[input.from] = null;
    cells[input.to] = card;
    emitCardsMove(ctx, [card], `cell:${input.from}`, `cell:${input.to}`);
    return acceptedAction({ ...state, cells }, ctx);
  },
};

const tableauToCell: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = tableauToCellPayload(payload, cellCount(state));
    if (!input) return error('bad-tableau-cell', 'expected {from, to} with a column and cell');
    const card = state.tableau[input.from]?.at(-1);
    if (!card) return error('tableau-empty', 'that column has no card');
    return state.cells[input.to] === null
      ? true
      : error('cell-occupied', 'that free cell already holds a card');
  },
  apply(state, _seat, payload, ctx) {
    const input = tableauToCellPayload(payload, cellCount(state)) as TableauToCellPayload;
    const tableau = cloneTableau(state.tableau);
    const card = (tableau[input.from] as CardId[]).pop() as CardId;
    const cells = cloneCells(state.cells);
    cells[input.to] = card;
    emitCardsMove(ctx, [card], `tableau:${input.from}`, `cell:${input.to}`);
    return acceptedAction({ ...state, tableau, cells }, ctx);
  },
};

const tableauToFoundation: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = tableauSourcePayload(payload);
    if (!input) return error('bad-source', 'expected {from} with a tableau column');
    const card = state.tableau[input.from]?.at(-1);
    if (!card) return error('tableau-empty', 'that column has no card');
    const suit = suitOfCard(card);
    return suit && canPlaceOnFoundation(card, state.foundations[suit])
      ? true
      : error('bad-foundation-target', 'that card cannot move to its foundation');
  },
  apply(state, _seat, payload, ctx) {
    const input = tableauSourcePayload(payload) as TableauSourcePayload;
    const tableau = cloneTableau(state.tableau);
    const card = (tableau[input.from] as CardId[]).pop() as CardId;
    const suit = suitOfCard(card) as FreecellSuit;
    const foundations = { ...state.foundations, [suit]: [...state.foundations[suit], card] };
    emitCardsMove(ctx, [card], `tableau:${input.from}`, `foundation:${suit}`);
    ctx.fx.emit(FreecellFx.FoundationBuild, { suit, card, count: foundations[suit].length });
    return acceptedAction({ ...state, tableau, foundations }, ctx);
  },
};

function validateTableauMove(
  state: FreecellState,
  _seat: number,
  payload: unknown,
): true | RuleError {
  const fault = playable(state);
  if (fault) return fault;
  const input = tableauMovePayload(payload);
  if (!input) return error('bad-tableau-move', 'expected {from, card, to} with distinct columns');
  const source = state.tableau[input.from] as CardId[];
  const destination = state.tableau[input.to] as CardId[];
  const index = source.indexOf(input.card);
  if (index < 0) return error('card-not-in-column', `${input.card} is not in that column`);
  const run = source.slice(index);
  if (!isPackedRun(run)) return error('broken-run', 'that suffix is not a packed run');
  const destEmpty = destination.length === 0;
  if (run.length > supermoveLimit(state.cells, state.tableau, destEmpty)) {
    return error('supermove-limit', 'that run is longer than the free-cell supermove allows');
  }
  const target = destination.at(-1) ?? null;
  return canPlaceOnTableau(run[0] as CardId, target)
    ? true
    : error('bad-tableau-target', 'the run does not fit that column');
}

const moveTableau: Move<FreecellState> = {
  validate: validateTableauMove,
  apply(state, _seat, payload, ctx) {
    const input = tableauMovePayload(payload) as TableauMovePayload;
    const tableau = cloneTableau(state.tableau);
    const source = tableau[input.from] as CardId[];
    const destination = tableau[input.to] as CardId[];
    const index = source.indexOf(input.card);
    const run = source.splice(index);
    destination.push(...run);
    emitCardsMove(ctx, run, `tableau:${input.from}`, `tableau:${input.to}`);
    return acceptedAction({ ...state, tableau }, ctx);
  },
};

const foundationToTableau: Move<FreecellState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = foundationTargetPayload(payload);
    if (!input) return error('bad-foundation-move', 'expected {suit, to}');
    const card = state.foundations[input.suit].at(-1);
    if (!card) return error('foundation-empty', 'that foundation is empty');
    const target = state.tableau[input.to]?.at(-1) ?? null;
    return canPlaceOnTableau(card, target)
      ? true
      : error('bad-tableau-target', 'the foundation card does not fit that column');
  },
  apply(state, _seat, payload, ctx) {
    const input = foundationTargetPayload(payload) as FoundationToTableauPayload;
    const foundations = {
      ...state.foundations,
      [input.suit]: state.foundations[input.suit].slice(),
    };
    const card = foundations[input.suit].pop() as CardId;
    const tableau = cloneTableau(state.tableau);
    (tableau[input.to] as CardId[]).push(card);
    emitCardsMove(ctx, [card], `foundation:${input.suit}`, `tableau:${input.to}`);
    return acceptedAction({ ...state, tableau, foundations }, ctx);
  },
};

export function legalMovesFor(state: FreecellState): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  const cells = cellCount(state);

  for (let from = 0; from < cells; from++) {
    const card = state.cells[from];
    if (!card) continue;
    const suit = suitOfCard(card);
    if (suit && canPlaceOnFoundation(card, state.foundations[suit])) {
      legal.push({ id: 'cell.toFoundation', payload: { from } });
    }
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      const target = state.tableau[to]?.at(-1) ?? null;
      if (canPlaceOnTableau(card, target)) {
        legal.push({ id: 'cell.toTableau', payload: { from, to } satisfies CellToTableauPayload });
      }
    }
    for (let to = 0; to < cells; to++) {
      if (to === from || state.cells[to] !== null) continue;
      legal.push({ id: 'cell.toCell', payload: { from, to } satisfies CellToCellPayload });
    }
  }

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const source = state.tableau[from] as CardId[];
    const top = source.at(-1);
    if (top) {
      const suit = suitOfCard(top);
      if (suit && canPlaceOnFoundation(top, state.foundations[suit])) {
        legal.push({
          id: 'tableau.toFoundation',
          payload: { from } satisfies TableauSourcePayload,
        });
      }
      for (let to = 0; to < cells; to++) {
        if (state.cells[to] !== null) continue;
        legal.push({ id: 'tableau.toCell', payload: { from, to } satisfies TableauToCellPayload });
      }
    }
    for (let cardIndex = 0; cardIndex < source.length; cardIndex++) {
      const run = source.slice(cardIndex);
      if (!isPackedRun(run)) continue;
      for (let to = 0; to < TABLEAU_COLUMNS; to++) {
        if (to === from) continue;
        const destEmpty = (state.tableau[to]?.length ?? 0) === 0;
        if (run.length > supermoveLimit(state.cells, state.tableau, destEmpty)) continue;
        const target = state.tableau[to]?.at(-1) ?? null;
        if (!canPlaceOnTableau(run[0] as CardId, target)) continue;
        legal.push({
          id: 'tableau.move',
          payload: { from, card: run[0] as CardId, to } satisfies TableauMovePayload,
        });
      }
    }
  }

  for (const suit of SUITS) {
    const card = state.foundations[suit].at(-1);
    if (!card) continue;
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      const target = state.tableau[to]?.at(-1) ?? null;
      if (canPlaceOnTableau(card, target)) {
        legal.push({
          id: 'foundation.toTableau',
          payload: { suit, to } satisfies FoundationToTableauPayload,
        });
      }
    }
  }
  return legal;
}

type HintKind =
  | 'foundation-clear'
  | 'foundation'
  | 'foundation-return'
  | 'free-cell'
  | 'free-column'
  | 'expose'
  | 'build'
  | 'shift';

interface RankedHint {
  move: LegalMove;
  score: number;
  kind: HintKind;
}

export function hintFor(state: FreecellPlayerView): FreecellHint | null {
  let best: RankedHint | null = null;
  for (const move of legalMovesFor(state)) {
    const ranked = rankHint(state, move);
    if (!ranked || ranked.score <= 0) continue;
    if (!best || ranked.score > best.score) best = { move, ...ranked };
  }
  return best ? { move: best.move, reason: hintReason(state, best.move, best.kind) } : null;
}

function rankHint(
  state: FreecellPlayerView,
  move: LegalMove,
): { score: number; kind: HintKind } | null {
  switch (move.id) {
    case 'tableau.toFoundation': {
      const from = (move.payload as TableauSourcePayload).from;
      const column = state.tableau[from];
      if (!column) return null;
      const card = column.at(-1);
      const clears = column.length === 1;
      const ace = rankOfCard(card ?? '') === 1;
      return {
        score: 180 + (clears ? 20 : 0) + (ace ? 5 : 0),
        kind: clears ? 'foundation-clear' : 'foundation',
      };
    }
    case 'cell.toFoundation': {
      const from = (move.payload as { from: number }).from;
      const ace = rankOfCard(state.cells[from] ?? '') === 1;
      return { score: 185 + (ace ? 5 : 0), kind: 'foundation-clear' };
    }
    case 'cell.toTableau':
      return { score: 100, kind: 'free-cell' };
    case 'tableau.toCell':
      return rankParkToCell(state, move);
    case 'tableau.move':
      return rankTableauMove(state, move);
    default:
      return null;
  }
}

function rankParkToCell(
  state: FreecellPlayerView,
  move: LegalMove,
): { score: number; kind: HintKind } | null {
  const from = (move.payload as TableauToCellPayload).from;
  const column = state.tableau[from];
  if (!column || column.length === 0) return null;
  if (column.length === 1) return { score: 110, kind: 'free-column' };
  const exposed = column.at(-2);
  const suit = exposed ? suitOfCard(exposed) : null;
  if (exposed && suit && canPlaceOnFoundation(exposed, state.foundations[suit])) {
    return { score: 80, kind: 'expose' };
  }
  return null;
}

function rankTableauMove(
  state: FreecellPlayerView,
  move: LegalMove,
): { score: number; kind: HintKind } | null {
  const meta = tableauMoveMeta(state, move);
  if (!meta) return null;
  if (meta.destEmpty && meta.movingEntire) return null;
  if (meta.empties) return { score: 110, kind: 'free-column' };
  if (meta.exposed) {
    const suit = suitOfCard(meta.exposed);
    if (suit && canPlaceOnFoundation(meta.exposed, state.foundations[suit])) {
      return { score: 90, kind: 'expose' };
    }
  }
  if (!meta.destEmpty) return { score: 70, kind: 'build' };
  return null;
}

function tableauMoveMeta(state: FreecellPlayerView, move: LegalMove) {
  if (move.id !== 'tableau.move') return null;
  const input = move.payload as TableauMovePayload;
  const source = state.tableau[input.from];
  const destination = state.tableau[input.to];
  if (!source || !destination) return null;
  const runIndex = source.indexOf(input.card);
  if (runIndex < 0) return null;
  const movingEntire = runIndex === 0;
  return {
    card: input.card,
    destEmpty: destination.length === 0,
    destTop: destination.at(-1) ?? null,
    empties: movingEntire,
    movingEntire,
    exposed: runIndex > 0 ? (source[runIndex - 1] as CardId) : null,
  };
}

function moveCard(state: FreecellPlayerView, move: LegalMove): CardId | null {
  const payload = move.payload as
    Partial<TableauMovePayload & TableauSourcePayload & FoundationToTableauPayload> | undefined;
  switch (move.id) {
    case 'tableau.move':
      return typeof payload?.card === 'string' ? payload.card : null;
    case 'tableau.toFoundation':
    case 'tableau.toCell':
      return validColumn(payload?.from) ? (state.tableau[payload.from]?.at(-1) ?? null) : null;
    case 'cell.toTableau':
    case 'cell.toFoundation':
    case 'cell.toCell':
      return validCell(payload?.from, state.cells.length)
        ? (state.cells[payload.from] ?? null)
        : null;
    case 'foundation.toTableau':
      return validSuit(payload?.suit) ? (state.foundations[payload.suit].at(-1) ?? null) : null;
    default:
      return null;
  }
}

function hintReason(state: FreecellPlayerView, move: LegalMove, kind: HintKind): string {
  const card = moveCard(state, move);
  const named = card ? nameOfCard(card) : 'that card';
  const meta = tableauMoveMeta(state, move);
  const targetNamed = meta?.destTop ? nameOfCard(meta.destTop) : null;
  const exposedNamed = meta?.exposed ? nameOfCard(meta.exposed) : null;
  switch (kind) {
    case 'foundation-clear':
      return move.id === 'cell.toFoundation'
        ? `Put the ${named} up to free a cell.`
        : `Put the ${named} up to clear a column.`;
    case 'foundation':
      return `Put the ${named} up.`;
    case 'free-cell': {
      const to = (move.payload as CellToTableauPayload | undefined)?.to;
      const destTop = validColumn(to) ? (state.tableau[to]?.at(-1) ?? null) : null;
      return destTop
        ? `Play the ${named} from a free cell onto the ${nameOfCard(destTop)}.`
        : `Play the ${named} from a free cell onto an empty column.`;
    }
    case 'free-column':
      return targetNamed
        ? `Move the ${named} onto the ${targetNamed} to clear a column.`
        : `Park the ${named} to clear a column.`;
    case 'expose':
      if (move.id === 'tableau.toCell') {
        const from = (move.payload as TableauToCellPayload).from;
        const exposed = state.tableau[from]?.at(-2);
        return exposed
          ? `Park the ${named} to free the ${nameOfCard(exposed)}.`
          : `Park the ${named} in a free cell.`;
      }
      return targetNamed
        ? `Move the ${named} onto the ${targetNamed}${exposedNamed ? ` to free the ${exposedNamed}` : ''}.`
        : `Move the ${named} to an empty column${exposedNamed ? ` to free the ${exposedNamed}` : ''}.`;
    case 'build':
      return targetNamed
        ? `Move the ${named} onto the ${targetNamed}.`
        : `Move the ${named} to an empty column.`;
    case 'foundation-return': {
      const to = (move.payload as FoundationToTableauPayload | undefined)?.to;
      const destTop = validColumn(to) ? (state.tableau[to]?.at(-1) ?? null) : null;
      return destTop
        ? `Bring the ${named} back onto the ${nameOfCard(destTop)}.`
        : `Bring the ${named} back onto the tableau.`;
    }
    case 'shift':
      return `Move the ${named} to an empty column.`;
  }
}

export function canAutoFinish(state: FreecellPlayerView): boolean {
  if (state.stage !== 'playing') return false;
  const tableau = cloneTableau(state.tableau);
  const cells = cloneCells(state.cells);
  const foundations: FreecellFoundations = {
    spades: state.foundations.spades.slice(),
    hearts: state.foundations.hearts.slice(),
    diamonds: state.foundations.diamonds.slice(),
    clubs: state.foundations.clubs.slice(),
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < cells.length; index++) {
      const card = cells[index];
      if (!card) continue;
      const suit = suitOfCard(card);
      if (!suit || !canPlaceOnFoundation(card, foundations[suit])) continue;
      cells[index] = null;
      foundations[suit].push(card);
      changed = true;
    }
    for (const column of tableau) {
      const card = column.at(-1);
      if (!card) continue;
      const suit = suitOfCard(card);
      if (!suit || !canPlaceOnFoundation(card, foundations[suit])) continue;
      column.pop();
      foundations[suit].push(card);
      changed = true;
    }
  }
  const home =
    SUITS.reduce((sum, suit) => sum + foundations[suit].length, 0) === DECK.cardIds.length;
  return (
    home && tableau.every((column) => column.length === 0) && cells.every((cell) => cell === null)
  );
}

export function freecellPlayerView(state: FreecellState): FreecellPlayerView {
  return {
    rules: { ...state.rules },
    stage: state.stage,
    tableau: cloneTableau(state.tableau),
    cells: cloneCells(state.cells),
    foundations: {
      spades: state.foundations.spades.slice(),
      hearts: state.foundations.hearts.slice(),
      diamonds: state.foundations.diamonds.slice(),
      clubs: state.foundations.clubs.slice(),
    },
    moves: state.moves,
  };
}

const flow: GameDef<FreecellState, FreecellRules>['flow'] = {
  start: phaseFor,
  legalMoves(state) {
    return legalMovesFor(state);
  },
  legalMovesFor(state, _phase, seat) {
    return seat === 0 ? legalMovesFor(state) : [];
  },
  advance(state): FlowAdvance {
    const ended = result(state);
    return ended ? { phase: phaseFor(state), ended } : { phase: phaseFor(state) };
  },
};

export function createFreecellDef(): GameDef<FreecellState, FreecellRules> {
  return {
    id: GAME_ID,
    configSchema: freecellConfig,
    howToPlay: freecellHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== FREECELL_SEATS) {
        throw new Error('freecell requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'cell.toTableau': cellToTableau,
      'cell.toFoundation': cellToFoundation,
      'cell.toCell': cellToCell,
      'tableau.toCell': tableauToCell,
      'tableau.toFoundation': tableauToFoundation,
      'tableau.move': moveTableau,
      'foundation.toTableau': foundationToTableau,
    },
    flow,
    playerView: freecellPlayerView,
    end: result,
    bots: [],
  };
}

export const freecellGame = createFreecellDef();
