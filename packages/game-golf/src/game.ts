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
  GOLF_SEATS,
  TABLEAU_COLUMNS,
  TABLEAU_ROWS,
  TABLEAU_SIZE,
  canPlayOnHole,
} from './cards';
import { golfConfig, type GolfRules } from './config';
import { golfHowToPlay } from './howto';
import type { GolfPlayerView, GolfState, TableauPlayPayload } from './state';

export const GAME_ID = 'golf';

const DEAL_STAGGER_MS = 45;

export const GolfFx = {
  StockDraw: 'golf.stock-draw',
  CardsMove: 'golf.cards-move',
  HoleOut: 'golf.hole-out',
  Win: 'golf.win',
} as const;

export interface GolfHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

export function leftoverOf(state: Pick<GolfState, 'tableau'>): number {
  return state.tableau.reduce((sum, column) => sum + column.length, 0);
}

function holeOf(state: Pick<GolfState, 'waste'>): CardId | null {
  return state.waste.at(-1) ?? null;
}

function cloneTableau(tableau: readonly CardId[][]): CardId[][] {
  return tableau.map((column) => column.slice());
}

function validColumn(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < TABLEAU_COLUMNS;
}

function playPayload(payload: unknown): TableauPlayPayload | null {
  const from = (payload as Partial<TableauPlayPayload> | undefined)?.from;
  return validColumn(from) ? { from } : null;
}

function playable(state: GolfState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'this hole is already complete');
}

function canPlayColumn(state: GolfState, columnIndex: number): boolean {
  const hole = holeOf(state);
  const card = state.tableau[columnIndex]?.at(-1);
  return Boolean(hole && card && canPlayOnHole(card, hole, state.rules.wrap));
}

export function hasTableauPlay(state: GolfState): boolean {
  for (let column = 0; column < TABLEAU_COLUMNS; column++) {
    if (canPlayColumn(state, column)) return true;
  }
  return false;
}

function phaseFor(state: GolfState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function result(state: GolfState): MatchResult | null {
  if (state.stage === 'playing') return null;
  const leftover = leftoverOf(state);
  const cleared = leftover === 0;
  return {
    winner: 0,
    rankings: [
      {
        seat: 0,
        rank: 1,
        detail: { leftover, moves: state.moves, cleared },
      },
    ],
    reason: cleared ? `cleared in ${state.moves} moves` : `${leftover} left on the grass`,
  };
}

function emitMove(ctx: MoveCtx, card: CardId, from: string, to: string): void {
  ctx.fx.emit(GolfFx.CardsMove, { cards: [card], from, to, dur: 200 });
}

function finishIfStuck(state: GolfState, ctx: MoveCtx): GolfState {
  const leftover = leftoverOf(state);
  if (leftover === 0) {
    ctx.fx.emit(GolfFx.Win, { moves: state.moves, leftover: 0 }, 160);
    ctx.fx.emit(Fx.RoundEnd, { reason: 'cleared' }, 240);
    return { ...state, stage: 'won' };
  }
  if (state.stock.length === 0 && !hasTableauPlay(state)) {
    ctx.fx.emit(GolfFx.HoleOut, { leftover, moves: state.moves }, 120);
    ctx.fx.emit(Fx.RoundEnd, { reason: 'hole-complete' }, 200);
    return { ...state, stage: 'holed' };
  }
  return state;
}

function acceptedAction(state: GolfState, ctx: MoveCtx): GolfState {
  return finishIfStuck({ ...state, moves: state.moves + 1 }, ctx);
}

function deal(ctx: Parameters<GameDef<GolfState, GolfRules>['setup']>[0]): GolfState {
  const order = ctx.rng.shuffle([...DECK.cardIds]);
  const tableau = Array.from({ length: TABLEAU_COLUMNS }, (): CardId[] => []);
  let cursor = 0;
  for (let row = 0; row < TABLEAU_ROWS; row++) {
    for (let column = 0; column < TABLEAU_COLUMNS; column++) {
      const card = order[cursor++] as CardId;
      (tableau[column] as CardId[]).push(card);
      ctx.fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `tableau:${column}`, faceDown: false, dur: 200 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  const remaining = order.slice(cursor);
  const hole = remaining[remaining.length - 1] as CardId;
  const stock = remaining.slice(0, -1);
  ctx.fx.emit(
    Fx.DealCard,
    { card: hole, from: 'stock', to: 'waste', faceDown: false, dur: 200 },
    TABLEAU_SIZE * DEAL_STAGGER_MS,
  );
  return {
    rules: ctx.config,
    stage: 'playing',
    stock,
    waste: [hole],
    tableau,
    moves: 0,
  };
}

const playTableau: Move<GolfState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = playPayload(payload);
    if (!input) return error('bad-source', 'expected {from} with a tableau column');
    const card = state.tableau[input.from]?.at(-1);
    if (!card) return error('tableau-empty', 'that column has no card');
    const hole = holeOf(state);
    if (!hole) return error('hole-empty', 'the hole has not been opened');
    return canPlayOnHole(card, hole, state.rules.wrap)
      ? true
      : error('bad-hole-target', 'that card is not one rank from the hole');
  },
  apply(state, _seat, payload, ctx) {
    const input = playPayload(payload) as TableauPlayPayload;
    const tableau = cloneTableau(state.tableau);
    const card = (tableau[input.from] as CardId[]).pop() as CardId;
    const waste = [...state.waste, card];
    emitMove(ctx, card, `tableau:${input.from}`, 'waste');
    return acceptedAction({ ...state, tableau, waste }, ctx);
  },
};

const drawStock: Move<GolfState> = {
  validate(state) {
    return (
      playable(state) ?? (state.stock.length > 0 ? true : error('stock-empty', 'the stock is gone'))
    );
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const card = stock.pop() as CardId;
    ctx.fx.emit(GolfFx.StockDraw, { card, count: 1 });
    ctx.fx.emit(Fx.DrawCard, { card, seat: 0, from: 'stock', to: 'waste', dur: 180 });
    return acceptedAction({ ...state, stock, waste: [...state.waste, card] }, ctx);
  },
};

export function legalMovesFor(state: GolfState): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    if (canPlayColumn(state, from)) {
      legal.push({ id: 'tableau.play', payload: { from } satisfies TableauPlayPayload });
    }
  }
  if (state.stock.length > 0) legal.push({ id: 'stock.draw' });
  return legal;
}

export function hintFor(state: GolfPlayerView): GolfHint | null {
  const legal = legalMovesFor(state);
  const plays = legal.filter((move) => move.id === 'tableau.play');
  const chain = plays.find((move) => {
    const from = (move.payload as TableauPlayPayload).from;
    const card = state.tableau[from]?.at(-1);
    const next = state.tableau[from]?.at(-2);
    return Boolean(card && next && canPlayOnHole(next, card, state.rules.wrap));
  });
  if (chain) return { move: chain, reason: 'Start a chain.' };
  if (plays[0]) return { move: plays[0], reason: 'Play onto the hole.' };
  const draw = legal.find((move) => move.id === 'stock.draw');
  return draw ? { move: draw, reason: 'Turn the next hole card.' } : null;
}

export function golfPlayerView(state: GolfState): GolfPlayerView {
  return {
    ...state,
    stock: state.stock.map(() => '??'),
    waste: state.waste.slice(),
    tableau: state.tableau.map((column) => column.slice()),
  };
}

const flow: GameDef<GolfState, GolfRules>['flow'] = {
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

export function createGolfDef(): GameDef<GolfState, GolfRules> {
  return {
    id: GAME_ID,
    configSchema: golfConfig,
    howToPlay: golfHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== GOLF_SEATS) {
        throw new Error('golf requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'tableau.play': playTableau,
      'stock.draw': drawStock,
    },
    flow,
    playerView: golfPlayerView,
    end: result,
    bots: [],
  };
}

export const golfGame = createGolfDef();
