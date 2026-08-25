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
  FOUNDATION_SLOTS,
  SPIDER_SEATS,
  STOCK_DEAL,
  TABLEAU_COLUMNS,
  TOTAL_CARDS,
  canPlaceOnTableau,
  completedRunStart,
  deckFor,
  isPackedRun,
  nameOfCard,
  suitOfCard,
  type SpiderSuit,
  type SpiderSuitCount,
} from './cards';
import { spiderConfig, type SpiderRules } from './config';
import { spiderHowToPlay } from './howto';
import type { SpiderColumn, SpiderPlayerView, SpiderState, TableauMovePayload } from './state';

export const GAME_ID = 'spider';

const DEAL_STAGGER_MS = 45;

export const SpiderFx = {
  StockDeal: 'spider.stock-deal',
  CardsMove: 'spider.cards-move',
  TableauFlip: 'spider.tableau-flip',
  SuitClear: 'spider.suit-clear',
  Win: 'spider.win',
} as const;

export interface SpiderHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

function emptyFoundations(): CardId[][] {
  return Array.from({ length: FOUNDATION_SLOTS }, () => []);
}

function foundationCount(state: Pick<SpiderState, 'foundations'>): number {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

function result(state: SpiderState): MatchResult | null {
  if (state.stage !== 'won' && foundationCount(state) !== TOTAL_CARDS) return null;
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

function phaseFor(state: SpiderState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function validColumn(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < TABLEAU_COLUMNS;
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

function cloneTableau(tableau: readonly SpiderColumn[]): SpiderColumn[] {
  return tableau.map((column) => ({ down: column.down.slice(), up: column.up.slice() }));
}

function cloneFoundations(foundations: readonly CardId[][]): CardId[][] {
  return foundations.map((pile) => pile.slice());
}

function emitCardsMove(ctx: MoveCtx, cards: readonly CardId[], from: string, to: string): void {
  ctx.fx.emit(SpiderFx.CardsMove, { cards: cards.slice(), from, to, dur: 220 });
}

function autoFlip(tableau: SpiderColumn[], columnIndex: number, ctx: MoveCtx): void {
  const column = tableau[columnIndex];
  if (!column || column.up.length > 0 || column.down.length === 0) return;
  const card = column.down.pop() as CardId;
  column.up.push(card);
  ctx.fx.emit(Fx.FlipCard, { card, from: `tableau:${columnIndex}`, to: `tableau:${columnIndex}` });
  ctx.fx.emit(SpiderFx.TableauFlip, { column: columnIndex, card }, 40);
}

function nextFoundationSlot(foundations: readonly CardId[][]): number {
  return foundations.findIndex((pile) => pile.length === 0);
}

function clearCompletedSuits(tableau: SpiderColumn[], foundations: CardId[][], ctx: MoveCtx): void {
  let again = true;
  while (again) {
    again = false;
    for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      const column = tableau[columnIndex] as SpiderColumn;
      const start = completedRunStart(column.up);
      if (start < 0) continue;
      const run = column.up.splice(start);
      const slot = nextFoundationSlot(foundations);
      if (slot < 0) continue;
      foundations[slot] = run;
      const suit = suitOfCard(run[0] as CardId);
      emitCardsMove(ctx, run, `tableau:${columnIndex}`, `foundation:${slot}`);
      ctx.fx.emit(SpiderFx.SuitClear, {
        column: columnIndex,
        slot,
        suit,
        cards: run.slice(),
      });
      autoFlip(tableau, columnIndex, ctx);
      again = true;
    }
  }
}

function acceptedAction(state: SpiderState, ctx: MoveCtx): SpiderState {
  const moves = state.moves + 1;
  if (foundationCount(state) !== TOTAL_CARDS) return { ...state, moves };
  ctx.fx.emit(SpiderFx.Win, { moves }, 180);
  ctx.fx.emit(Fx.RoundEnd, { reason: 'suits-complete' }, 260);
  return { ...state, moves, stage: 'won' };
}

function deal(ctx: Parameters<GameDef<SpiderState, SpiderRules>['setup']>[0]): SpiderState {
  const deck = deckFor(ctx.config.suitCount as SpiderSuitCount);
  const order = ctx.rng.shuffle([...deck.cardIds]);
  const tableau = Array.from({ length: TABLEAU_COLUMNS }, (): SpiderColumn => ({
    down: [],
    up: [],
  }));
  let cursor = 0;
  const emitDeal = (columnIndex: number, card: CardId, faceUp: boolean) => {
    ctx.fx.emit(
      Fx.DealCard,
      {
        card: faceUp ? card : '??',
        from: 'stock',
        to: `tableau:${columnIndex}`,
        faceDown: !faceUp,
        dur: 220,
      },
      (cursor - 1) * DEAL_STAGGER_MS,
    );
  };
  for (let row = 0; row < 4; row++) {
    for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      const card = order[cursor++] as CardId;
      (tableau[columnIndex] as SpiderColumn).down.push(card);
      emitDeal(columnIndex, card, false);
    }
  }
  for (let columnIndex = 0; columnIndex < 4; columnIndex++) {
    const card = order[cursor++] as CardId;
    (tableau[columnIndex] as SpiderColumn).down.push(card);
    emitDeal(columnIndex, card, false);
  }
  for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
    const card = order[cursor++] as CardId;
    (tableau[columnIndex] as SpiderColumn).up.push(card);
    emitDeal(columnIndex, card, true);
  }
  return {
    rules: ctx.config,
    stage: 'playing',
    stock: order.slice(cursor),
    tableau,
    foundations: emptyFoundations(),
    moves: 0,
  };
}

function playable(state: SpiderState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'this deal is already complete');
}

function columnEmpty(column: SpiderColumn | undefined): boolean {
  return Boolean(column && column.down.length === 0 && column.up.length === 0);
}

function hasEmptyColumn(state: Pick<SpiderState, 'tableau'>): boolean {
  return state.tableau.some((column) => columnEmpty(column));
}

const dealStock: Move<SpiderState> = {
  validate(state) {
    const fault = playable(state);
    if (fault) return fault;
    if (state.stock.length < STOCK_DEAL)
      return error('stock-short', 'the stock does not have a full row left');
    return hasEmptyColumn(state)
      ? error('empty-column', 'fill every column before dealing a row')
      : true;
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const tableau = cloneTableau(state.tableau);
    const dealt: CardId[] = [];
    for (let columnIndex = 0; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      const card = stock.pop() as CardId;
      dealt.push(card);
      (tableau[columnIndex] as SpiderColumn).up.push(card);
      ctx.fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `tableau:${columnIndex}`, faceDown: false, dur: 180 },
        columnIndex * 40,
      );
    }
    ctx.fx.emit(SpiderFx.StockDeal, { cards: dealt, count: dealt.length, remaining: stock.length });
    const foundations = cloneFoundations(state.foundations);
    clearCompletedSuits(tableau, foundations, ctx);
    return acceptedAction({ ...state, stock, tableau, foundations }, ctx);
  },
};

function validateTableauMove(
  state: SpiderState,
  _seat: number,
  payload: unknown,
): true | RuleError {
  const fault = playable(state);
  if (fault) return fault;
  const input = tableauMovePayload(payload);
  if (!input) return error('bad-tableau-move', 'expected {from, card, to} with distinct columns');
  const source = state.tableau[input.from] as SpiderColumn;
  const destination = state.tableau[input.to] as SpiderColumn;
  const index = source.up.indexOf(input.card);
  if (index < 0) return error('card-not-face-up', `${input.card} is not face up in that column`);
  const run = source.up.slice(index);
  if (!isPackedRun(run)) return error('broken-run', 'that face-up suffix is not a same-suit run');
  const target = destination.up.at(-1) ?? null;
  return canPlaceOnTableau(run[0] as CardId, target)
    ? true
    : error('bad-tableau-target', 'the run does not fit that column');
}

const moveTableau: Move<SpiderState> = {
  validate: validateTableauMove,
  apply(state, _seat, payload, ctx) {
    const input = tableauMovePayload(payload) as TableauMovePayload;
    const tableau = cloneTableau(state.tableau);
    const source = tableau[input.from] as SpiderColumn;
    const destination = tableau[input.to] as SpiderColumn;
    const index = source.up.indexOf(input.card);
    const run = source.up.splice(index);
    destination.up.push(...run);
    emitCardsMove(ctx, run, `tableau:${input.from}`, `tableau:${input.to}`);
    autoFlip(tableau, input.from, ctx);
    const foundations = cloneFoundations(state.foundations);
    clearCompletedSuits(tableau, foundations, ctx);
    return acceptedAction({ ...state, tableau, foundations }, ctx);
  },
};

export function legalMovesFor(state: SpiderState | SpiderPlayerView): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  if (state.stock.length >= STOCK_DEAL && !hasEmptyColumn(state)) {
    legal.push({ id: 'stock.deal' });
  }

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const source = state.tableau[from] as SpiderColumn;
    for (let cardIndex = 0; cardIndex < source.up.length; cardIndex++) {
      const run = source.up.slice(cardIndex);
      if (!isPackedRun(run)) continue;
      for (let to = 0; to < TABLEAU_COLUMNS; to++) {
        if (to === from) continue;
        const target = state.tableau[to]?.up.at(-1) ?? null;
        if (!canPlaceOnTableau(run[0] as CardId, target)) continue;
        legal.push({
          id: 'tableau.move',
          payload: { from, card: run[0] as CardId, to } satisfies TableauMovePayload,
        });
      }
    }
  }
  return legal;
}

type HintKind = 'complete' | 'uncover' | 'same-suit' | 'shift' | 'deal';

interface RankedHint {
  move: LegalMove;
  score: number;
  kind: HintKind;
}

export function hintFor(state: SpiderPlayerView): SpiderHint | null {
  let best: RankedHint | null = null;
  for (const move of legalMovesFor(state)) {
    const ranked = rankHint(state, move);
    if (!ranked || ranked.score <= 0) continue;
    if (!best || ranked.score > best.score) best = { move, ...ranked };
  }
  return best ? { move: best.move, reason: hintReason(state, best.move, best.kind) } : null;
}

function rankHint(
  state: SpiderPlayerView,
  move: LegalMove,
): { score: number; kind: HintKind } | null {
  if (move.id === 'stock.deal') return { score: 10, kind: 'deal' };
  if (move.id !== 'tableau.move') return null;
  const meta = tableauMoveMeta(state, move);
  if (!meta) return null;
  if (meta.destEmpty && meta.empties) return null;
  if (meta.completes) return { score: 200 + (meta.uncovers ? 20 : 0), kind: 'complete' };
  if (meta.uncovers) return { score: 100 + meta.downs, kind: 'uncover' };
  if (meta.sameSuit) return { score: 70, kind: 'same-suit' };
  return { score: 20, kind: 'shift' };
}

function tableauMoveMeta(state: SpiderPlayerView, move: LegalMove) {
  if (move.id !== 'tableau.move') return null;
  const input = move.payload as TableauMovePayload;
  const source = state.tableau[input.from];
  const destination = state.tableau[input.to];
  if (!source || !destination) return null;
  const runIndex = source.up.indexOf(input.card);
  if (runIndex < 0) return null;
  const run = source.up.slice(runIndex);
  const nextUp = [...destination.up, ...run];
  const destTop = destination.up.at(-1) ?? null;
  const movingEntireUp = runIndex === 0;
  return {
    card: input.card,
    downs: source.down.length,
    destEmpty: destination.up.length === 0 && destination.down.length === 0,
    destTop,
    empties: movingEntireUp && source.down.length === 0,
    uncovers: movingEntireUp && source.down.length > 0,
    sameSuit: Boolean(destTop && suitOfCard(input.card) === suitOfCard(destTop)),
    completes: completedRunStart(nextUp) >= 0,
  };
}

function hintReason(state: SpiderPlayerView, move: LegalMove, kind: HintKind): string {
  const meta = tableauMoveMeta(state, move);
  const named = meta ? nameOfCard(meta.card) : 'that card';
  const targetNamed = meta?.destTop ? nameOfCard(meta.destTop) : null;
  switch (kind) {
    case 'complete': {
      const suit = suitOfCard(meta?.card ?? '') as SpiderSuit | null;
      return suit
        ? `Move the ${named} to finish a ${suit} run.`
        : `Move the ${named} to finish a suit.`;
    }
    case 'uncover':
      return targetNamed
        ? `Move the ${named} onto the ${targetNamed} to turn a hidden card.`
        : `Move the ${named} to an empty column to turn a hidden card.`;
    case 'same-suit':
      return targetNamed
        ? `Build the ${named} onto the ${targetNamed} of the same suit.`
        : `Move the ${named} to keep a suited run together.`;
    case 'shift':
      return targetNamed
        ? `Move the ${named} onto the ${targetNamed}.`
        : `Move the ${named} to an empty column.`;
    case 'deal':
      return state.stock.length >= STOCK_DEAL * 2
        ? 'Deal a row from the stock.'
        : 'Deal the last row from the stock.';
  }
}

export function spiderPlayerView(state: SpiderState): SpiderPlayerView {
  return {
    ...state,
    stock: state.stock.map(() => '??'),
    tableau: state.tableau.map((column) => ({
      down: column.down.map(() => '??'),
      up: column.up.slice(),
    })),
    foundations: state.foundations.map((pile) => pile.slice()),
  };
}

const flow: GameDef<SpiderState, SpiderRules>['flow'] = {
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

export function createSpiderDef(): GameDef<SpiderState, SpiderRules> {
  return {
    id: GAME_ID,
    configSchema: spiderConfig,
    howToPlay: spiderHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== SPIDER_SEATS) {
        throw new Error('spider requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'stock.deal': dealStock,
      'tableau.move': moveTableau,
    },
    flow,
    playerView: spiderPlayerView,
    end: result,
    bots: [],
  };
}

export const spiderGame = createSpiderDef();
