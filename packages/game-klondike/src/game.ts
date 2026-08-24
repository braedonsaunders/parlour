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
  DECK,
  KLONDIKE_SEATS,
  SUITS,
  TABLEAU_COLUMNS,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  isPackedRun,
  suitOfCard,
  type KlondikeSuit,
} from './cards';
import { klondikeConfig, type KlondikeRules } from './config';
import { klondikeHowToPlay } from './howto';
import type {
  FoundationToTableauPayload,
  KlondikeColumn,
  KlondikeFoundations,
  KlondikePlayerView,
  KlondikeState,
  TableauMovePayload,
  TableauSourcePayload,
  TableauTargetPayload,
} from './state';

export const GAME_ID = 'klondike';

const DEAL_STAGGER_MS = 55;

export const KlondikeFx = {
  StockDraw: 'klondike.stock-draw',
  StockRecycle: 'klondike.stock-recycle',
  CardsMove: 'klondike.cards-move',
  TableauFlip: 'klondike.tableau-flip',
  FoundationBuild: 'klondike.foundation-build',
  Win: 'klondike.win',
} as const;

export interface KlondikeHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

function emptyFoundations(): KlondikeFoundations {
  return { spades: [], hearts: [], diamonds: [], clubs: [] };
}

function foundationCount(state: Pick<KlondikeState, 'foundations'>): number {
  return SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
}

function result(state: KlondikeState): MatchResult | null {
  if (state.stage !== 'won' && foundationCount(state) !== DECK.cardIds.length) return null;
  return {
    winner: 0,
    rankings: [
      {
        seat: 0,
        rank: 1,
        detail: { moves: state.moves, recycles: state.recycles },
      },
    ],
    reason: `solved in ${state.moves} moves`,
  };
}

function phaseFor(state: KlondikeState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function validColumn(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < TABLEAU_COLUMNS;
}

function validSuit(value: unknown): value is KlondikeSuit {
  return typeof value === 'string' && SUITS.includes(value as KlondikeSuit);
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

function tableauTargetPayload(payload: unknown): TableauTargetPayload | null {
  const to = (payload as Partial<TableauTargetPayload> | undefined)?.to;
  return validColumn(to) ? { to } : null;
}

function tableauSourcePayload(payload: unknown): TableauSourcePayload | null {
  const from = (payload as Partial<TableauSourcePayload> | undefined)?.from;
  return validColumn(from) ? { from } : null;
}

function foundationTargetPayload(payload: unknown): FoundationToTableauPayload | null {
  const input = payload as Partial<FoundationToTableauPayload> | undefined;
  return input && validSuit(input.suit) && validColumn(input.to)
    ? { suit: input.suit, to: input.to }
    : null;
}

function cloneTableau(tableau: readonly KlondikeColumn[]): KlondikeColumn[] {
  return tableau.map((column) => ({ down: column.down.slice(), up: column.up.slice() }));
}

function emitCardsMove(ctx: MoveCtx, cards: readonly CardId[], from: string, to: string): void {
  ctx.fx.emit(KlondikeFx.CardsMove, { cards: cards.slice(), from, to, dur: 220 });
}

function autoFlip(tableau: KlondikeColumn[], columnIndex: number, ctx: MoveCtx): void {
  const column = tableau[columnIndex];
  if (!column || column.up.length > 0 || column.down.length === 0) return;
  const card = column.down.pop() as CardId;
  column.up.push(card);
  ctx.fx.emit(Fx.FlipCard, { card, from: `tableau:${columnIndex}`, to: `tableau:${columnIndex}` });
  ctx.fx.emit(KlondikeFx.TableauFlip, { column: columnIndex, card }, 40);
}

function acceptedAction(state: KlondikeState, ctx: MoveCtx): KlondikeState {
  const moves = state.moves + 1;
  if (foundationCount(state) !== DECK.cardIds.length) return { ...state, moves };
  ctx.fx.emit(KlondikeFx.Win, { moves, recycles: state.recycles }, 180);
  ctx.fx.emit(Fx.RoundEnd, { reason: 'foundations-complete' }, 260);
  return { ...state, moves, stage: 'won' };
}

function deal(ctx: Parameters<GameDef<KlondikeState, KlondikeRules>['setup']>[0]): KlondikeState {
  const order = ctx.rng.shuffle([...DECK.cardIds]);
  const tableau = Array.from({ length: TABLEAU_COLUMNS }, (): KlondikeColumn => ({
    down: [],
    up: [],
  }));
  let cursor = 0;
  for (let pass = 0; pass < TABLEAU_COLUMNS; pass++) {
    for (let columnIndex = pass; columnIndex < TABLEAU_COLUMNS; columnIndex++) {
      const card = order[cursor++] as CardId;
      const faceUp = pass === columnIndex;
      const column = tableau[columnIndex] as KlondikeColumn;
      (faceUp ? column.up : column.down).push(card);
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
    }
  }
  return {
    rules: ctx.config,
    stage: 'playing',
    stock: order.slice(cursor),
    waste: [],
    tableau,
    foundations: emptyFoundations(),
    moves: 0,
    recycles: 0,
  };
}

function playable(state: KlondikeState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'this deal is already complete');
}

const drawStock: Move<KlondikeState> = {
  validate(state) {
    return (
      playable(state) ??
      (state.stock.length > 0 ? true : error('stock-empty', 'recycle the waste first'))
    );
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const waste = state.waste.slice();
    const drawn: CardId[] = [];
    const count = Math.min(state.rules.drawCount, stock.length);
    for (let index = 0; index < count; index++) {
      const card = stock.pop() as CardId;
      drawn.push(card);
      waste.push(card);
    }
    ctx.fx.emit(KlondikeFx.StockDraw, { cards: drawn, count: drawn.length, drawCount: count });
    for (let index = 0; index < drawn.length; index++) {
      ctx.fx.emit(
        Fx.DrawCard,
        { card: drawn[index], seat: 0, from: 'stock', to: 'waste', dur: 180 },
        index * 55,
      );
    }
    return acceptedAction({ ...state, stock, waste }, ctx);
  },
};

const recycleStock: Move<KlondikeState> = {
  validate(state) {
    const fault = playable(state);
    if (fault) return fault;
    if (state.stock.length > 0)
      return error('stock-not-empty', 'finish the stock before recycling');
    return state.waste.length > 0
      ? true
      : error('waste-empty', 'there are no waste cards to recycle');
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.waste.slice().reverse();
    ctx.fx.emit(Fx.ShuffleStock, { count: stock.length, shuffled: false });
    ctx.fx.emit(KlondikeFx.StockRecycle, { count: stock.length, pass: state.recycles + 1 });
    return acceptedAction({ ...state, stock, waste: [], recycles: state.recycles + 1 }, ctx);
  },
};

function validateTableauMove(
  state: KlondikeState,
  _seat: number,
  payload: unknown,
): true | RuleError {
  const fault = playable(state);
  if (fault) return fault;
  const input = tableauMovePayload(payload);
  if (!input) return error('bad-tableau-move', 'expected {from, card, to} with distinct columns');
  const source = state.tableau[input.from] as KlondikeColumn;
  const destination = state.tableau[input.to] as KlondikeColumn;
  const index = source.up.indexOf(input.card);
  if (index < 0) return error('card-not-face-up', `${input.card} is not face up in that column`);
  const run = source.up.slice(index);
  if (!isPackedRun(run)) return error('broken-run', 'that face-up suffix is not a packed run');
  const target = destination.up.at(-1) ?? null;
  return canPlaceOnTableau(run[0] as CardId, target)
    ? true
    : error('bad-tableau-target', 'the run does not fit that column');
}

const moveTableau: Move<KlondikeState> = {
  validate: validateTableauMove,
  apply(state, _seat, payload, ctx) {
    const input = tableauMovePayload(payload) as TableauMovePayload;
    const tableau = cloneTableau(state.tableau);
    const source = tableau[input.from] as KlondikeColumn;
    const destination = tableau[input.to] as KlondikeColumn;
    const index = source.up.indexOf(input.card);
    const run = source.up.splice(index);
    destination.up.push(...run);
    emitCardsMove(ctx, run, `tableau:${input.from}`, `tableau:${input.to}`);
    autoFlip(tableau, input.from, ctx);
    return acceptedAction({ ...state, tableau }, ctx);
  },
};

const wasteToTableau: Move<KlondikeState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = tableauTargetPayload(payload);
    if (!input) return error('bad-target', 'expected {to} with a tableau column');
    const card = state.waste.at(-1);
    if (!card) return error('waste-empty', 'there is no waste card to move');
    const target = state.tableau[input.to]?.up.at(-1) ?? null;
    return canPlaceOnTableau(card, target)
      ? true
      : error('bad-tableau-target', 'the waste card does not fit that column');
  },
  apply(state, _seat, payload, ctx) {
    const input = tableauTargetPayload(payload) as TableauTargetPayload;
    const waste = state.waste.slice();
    const card = waste.pop() as CardId;
    const tableau = cloneTableau(state.tableau);
    (tableau[input.to] as KlondikeColumn).up.push(card);
    emitCardsMove(ctx, [card], 'waste', `tableau:${input.to}`);
    return acceptedAction({ ...state, waste, tableau }, ctx);
  },
};

const wasteToFoundation: Move<KlondikeState> = {
  validate(state) {
    const fault = playable(state);
    if (fault) return fault;
    const card = state.waste.at(-1);
    if (!card) return error('waste-empty', 'there is no waste card to move');
    const suit = suitOfCard(card);
    return suit && canPlaceOnFoundation(card, state.foundations[suit])
      ? true
      : error('bad-foundation-target', 'the waste card cannot move to its foundation');
  },
  apply(state, _seat, _payload, ctx) {
    const waste = state.waste.slice();
    const card = waste.pop() as CardId;
    const suit = suitOfCard(card) as KlondikeSuit;
    const foundations = { ...state.foundations, [suit]: [...state.foundations[suit], card] };
    emitCardsMove(ctx, [card], 'waste', `foundation:${suit}`);
    ctx.fx.emit(KlondikeFx.FoundationBuild, { suit, card, count: foundations[suit].length });
    return acceptedAction({ ...state, waste, foundations }, ctx);
  },
};

const tableauToFoundation: Move<KlondikeState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = tableauSourcePayload(payload);
    if (!input) return error('bad-source', 'expected {from} with a tableau column');
    const card = state.tableau[input.from]?.up.at(-1);
    if (!card) return error('tableau-empty', 'that column has no face-up card');
    const suit = suitOfCard(card);
    return suit && canPlaceOnFoundation(card, state.foundations[suit])
      ? true
      : error('bad-foundation-target', 'that card cannot move to its foundation');
  },
  apply(state, _seat, payload, ctx) {
    const input = tableauSourcePayload(payload) as TableauSourcePayload;
    const tableau = cloneTableau(state.tableau);
    const card = (tableau[input.from] as KlondikeColumn).up.pop() as CardId;
    const suit = suitOfCard(card) as KlondikeSuit;
    const foundations = { ...state.foundations, [suit]: [...state.foundations[suit], card] };
    emitCardsMove(ctx, [card], `tableau:${input.from}`, `foundation:${suit}`);
    ctx.fx.emit(KlondikeFx.FoundationBuild, { suit, card, count: foundations[suit].length });
    autoFlip(tableau, input.from, ctx);
    return acceptedAction({ ...state, tableau, foundations }, ctx);
  },
};

const foundationToTableau: Move<KlondikeState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = foundationTargetPayload(payload);
    if (!input) return error('bad-foundation-move', 'expected {suit, to}');
    const card = state.foundations[input.suit].at(-1);
    if (!card) return error('foundation-empty', 'that foundation is empty');
    const target = state.tableau[input.to]?.up.at(-1) ?? null;
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
    (tableau[input.to] as KlondikeColumn).up.push(card);
    emitCardsMove(ctx, [card], `foundation:${input.suit}`, `tableau:${input.to}`);
    return acceptedAction({ ...state, tableau, foundations }, ctx);
  },
};

export function legalMovesFor(state: KlondikeState): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  if (state.stock.length > 0) legal.push({ id: 'stock.draw' });
  else if (state.waste.length > 0) legal.push({ id: 'stock.recycle' });

  const wasteCard = state.waste.at(-1);
  if (wasteCard) {
    const suit = suitOfCard(wasteCard);
    if (suit && canPlaceOnFoundation(wasteCard, state.foundations[suit])) {
      legal.push({ id: 'waste.toFoundation', hint: `Move ${wasteCard} to its foundation` });
    }
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      const target = state.tableau[to]?.up.at(-1) ?? null;
      if (canPlaceOnTableau(wasteCard, target)) {
        legal.push({ id: 'waste.toTableau', payload: { to } satisfies TableauTargetPayload });
      }
    }
  }

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const source = state.tableau[from] as KlondikeColumn;
    const top = source.up.at(-1);
    if (top) {
      const suit = suitOfCard(top);
      if (suit && canPlaceOnFoundation(top, state.foundations[suit])) {
        legal.push({
          id: 'tableau.toFoundation',
          payload: { from } satisfies TableauSourcePayload,
        });
      }
    }
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

  for (const suit of SUITS) {
    const card = state.foundations[suit].at(-1);
    if (!card) continue;
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      const target = state.tableau[to]?.up.at(-1) ?? null;
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

export function hintFor(state: KlondikePlayerView): KlondikeHint | null {
  const legal = legalMovesFor(state);
  const tableauFoundation = legal.find((move) => move.id === 'tableau.toFoundation');
  if (tableauFoundation) return { move: tableauFoundation, reason: 'Build a foundation.' };
  const wasteFoundation = legal.find((move) => move.id === 'waste.toFoundation');
  if (wasteFoundation) return { move: wasteFoundation, reason: 'The waste can build upward.' };
  const uncover = legal.find((move) => {
    if (move.id !== 'tableau.move') return false;
    const input = move.payload as TableauMovePayload;
    const source = state.tableau[input.from] as KlondikeColumn;
    return source.down.length > 0 && source.up[0] === input.card;
  });
  if (uncover) return { move: uncover, reason: 'Open the next hidden tableau card.' };
  const wasteTableau = legal.find((move) => move.id === 'waste.toTableau');
  if (wasteTableau) return { move: wasteTableau, reason: 'Add the waste card to the tableau.' };
  const tableauMove = legal.find((move) => move.id === 'tableau.move');
  if (tableauMove) return { move: tableauMove, reason: 'Pack this run onto the tableau.' };
  const stock = legal.find((move) => move.id === 'stock.draw' || move.id === 'stock.recycle');
  return stock ? { move: stock, reason: 'Turn the stock for another card.' } : null;
}

export function canAutoFinish(state: KlondikePlayerView): boolean {
  if (state.stock.length > 0 || state.waste.length > 0) return false;
  if (state.tableau.some((column) => column.down.length > 0)) return false;
  const tableau = cloneTableau(state.tableau);
  const foundations: KlondikeFoundations = {
    spades: state.foundations.spades.slice(),
    hearts: state.foundations.hearts.slice(),
    diamonds: state.foundations.diamonds.slice(),
    clubs: state.foundations.clubs.slice(),
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const column of tableau) {
      const card = column.up.at(-1);
      if (!card) continue;
      const suit = suitOfCard(card);
      if (!suit || !canPlaceOnFoundation(card, foundations[suit])) continue;
      column.up.pop();
      foundations[suit].push(card);
      changed = true;
    }
  }
  return SUITS.reduce((sum, suit) => sum + foundations[suit].length, 0) === DECK.cardIds.length;
}

export function klondikePlayerView(state: KlondikeState): KlondikePlayerView {
  return {
    ...state,
    stock: state.stock.map(() => '??'),
    waste: state.waste.slice(),
    tableau: state.tableau.map((column) => ({
      down: column.down.map(() => '??'),
      up: column.up.slice(),
    })),
    foundations: {
      spades: state.foundations.spades.slice(),
      hearts: state.foundations.hearts.slice(),
      diamonds: state.foundations.diamonds.slice(),
      clubs: state.foundations.clubs.slice(),
    },
  };
}

const flow: GameDef<KlondikeState, KlondikeRules>['flow'] = {
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

export function createKlondikeDef(): GameDef<KlondikeState, KlondikeRules> {
  return {
    id: GAME_ID,
    configSchema: klondikeConfig,
    howToPlay: klondikeHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== KLONDIKE_SEATS) {
        throw new Error('klondike requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'stock.draw': drawStock,
      'stock.recycle': recycleStock,
      'tableau.move': moveTableau,
      'waste.toTableau': wasteToTableau,
      'waste.toFoundation': wasteToFoundation,
      'tableau.toFoundation': tableauToFoundation,
      'foundation.toTableau': foundationToTableau,
    },
    flow,
    playerView: klondikePlayerView,
    end: result,
    bots: [],
  };
}

export const klondikeGame = createKlondikeDef();
