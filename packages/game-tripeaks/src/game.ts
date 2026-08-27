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
import { DECK, TABLEAU_SIZE, TRIPEAKS_SEATS, canPlayOnHole, isFree, validIndex } from './cards';
import { tripeaksConfig, type TripeaksRules } from './config';
import { tripeaksHowToPlay } from './howto';
import type { TableauPlayPayload, TripeaksPlayerView, TripeaksState } from './state';

export const GAME_ID = 'tripeaks';

const DEAL_STAGGER_MS = 35;

export const TripeaksFx = {
  Play: 'tripeaks.play',
  StockFlip: 'tripeaks.stock-flip',
  StockRecycle: 'tripeaks.stock-recycle',
  HoleOut: 'tripeaks.hole-out',
  Win: 'tripeaks.win',
  /** Optional extra hook for a peaks-cleared celebration; Fx.RoundEnd already fires. */
  Clear: 'tripeaks.clear',
} as const;

export interface TripeaksHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

export function leftoverOf(state: Pick<TripeaksState, 'tableau'>): number {
  return state.tableau.reduce((sum: number, card) => sum + (card ? 1 : 0), 0);
}

export function canRecycle(
  state: Pick<TripeaksState, 'rules' | 'stock' | 'hole' | 'recycles'>,
): boolean {
  if (!state.rules.recycle) return false;
  if (state.stock.length > 0 || state.hole.length <= 1) return false;
  return state.recycles < 1;
}

function holeOf(state: Pick<TripeaksState, 'hole'>): CardId | null {
  return state.hole.at(-1) ?? null;
}

function playable(state: TripeaksState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'these peaks are already complete');
}

function playPayload(payload: unknown): TableauPlayPayload | null {
  const from = (payload as Partial<TableauPlayPayload> | undefined)?.from;
  return validIndex(from) ? { from } : null;
}

function canPlayIndex(state: TripeaksState, index: number): boolean {
  const hole = holeOf(state);
  const card = state.tableau[index];
  return Boolean(
    hole && card && isFree(state.tableau, index) && canPlayOnHole(card, hole, state.rules.wrap),
  );
}

export function hasTableauPlay(state: TripeaksState): boolean {
  for (let index = 0; index < TABLEAU_SIZE; index++) {
    if (canPlayIndex(state, index)) return true;
  }
  return false;
}

function phaseFor(state: TripeaksState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function result(state: TripeaksState): MatchResult | null {
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
    reason: cleared ? `cleared in ${state.moves} moves` : `${leftover} left on the peaks`,
  };
}

function finishIfStuck(state: TripeaksState, ctx: MoveCtx): TripeaksState {
  const leftover = leftoverOf(state);
  if (leftover === 0) {
    ctx.fx.emit(TripeaksFx.Win, { moves: state.moves, leftover: 0 }, 160);
    ctx.fx.emit(TripeaksFx.Clear, { moves: state.moves }, 160);
    ctx.fx.emit(Fx.RoundEnd, { reason: 'cleared' }, 240);
    return { ...state, stage: 'won' };
  }
  if (hasTableauPlay(state) || state.stock.length > 0 || canRecycle(state)) return state;
  ctx.fx.emit(TripeaksFx.HoleOut, { leftover, moves: state.moves }, 120);
  ctx.fx.emit(Fx.RoundEnd, { reason: 'hole-complete' }, 200);
  return { ...state, stage: 'holed' };
}

function acceptedAction(state: TripeaksState, ctx: MoveCtx): TripeaksState {
  return finishIfStuck({ ...state, moves: state.moves + 1 }, ctx);
}

function deal(ctx: Parameters<GameDef<TripeaksState, TripeaksRules>['setup']>[0]): TripeaksState {
  const order = ctx.rng.shuffle([...DECK.cardIds]);
  const tableau = order.slice(0, TABLEAU_SIZE) as CardId[];
  tableau.forEach((card, index) => {
    ctx.fx.emit(
      Fx.DealCard,
      { card, from: 'stock', to: `tableau:${index}`, faceDown: false, dur: 200 },
      index * DEAL_STAGGER_MS,
    );
  });
  const remaining = order.slice(TABLEAU_SIZE);
  const hole = remaining[remaining.length - 1] as CardId;
  const stock = remaining.slice(0, -1);
  ctx.fx.emit(
    Fx.DealCard,
    { card: hole, from: 'stock', to: 'hole', faceDown: false, dur: 200 },
    TABLEAU_SIZE * DEAL_STAGGER_MS,
  );
  return {
    rules: ctx.config,
    stage: 'playing',
    tableau: tableau as (CardId | null)[],
    stock,
    hole: [hole],
    moves: 0,
    recycles: 0,
  };
}

const playTableau: Move<TripeaksState> = {
  validate(state, _seat, payload) {
    const fault = playable(state);
    if (fault) return fault;
    const input = playPayload(payload);
    if (!input) return error('bad-source', 'expected {from} with a tableau index');
    const card = state.tableau[input.from];
    if (!card) return error('tableau-empty', 'that peak slot is already gone');
    if (!isFree(state.tableau, input.from)) return error('covered', 'that card is still covered');
    const hole = holeOf(state);
    if (!hole) return error('hole-empty', 'the hole has not been opened');
    return canPlayOnHole(card, hole, state.rules.wrap)
      ? true
      : error('bad-hole-target', 'that card is not one rank from the hole');
  },
  apply(state, _seat, payload, ctx) {
    const input = playPayload(payload) as TableauPlayPayload;
    const tableau = state.tableau.slice();
    const card = tableau[input.from] as CardId;
    tableau[input.from] = null;
    const hole = [...state.hole, card];
    ctx.fx.emit(TripeaksFx.Play, {
      cards: [card],
      from: `tableau:${input.from}`,
      to: 'hole',
      dur: 200,
    });
    return acceptedAction({ ...state, tableau, hole }, ctx);
  },
};

const flipStock: Move<TripeaksState> = {
  validate(state) {
    return (
      playable(state) ?? (state.stock.length > 0 ? true : error('stock-empty', 'the stock is gone'))
    );
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const card = stock.pop() as CardId;
    ctx.fx.emit(TripeaksFx.StockFlip, { card, from: 'stock', to: 'hole', dur: 200 });
    ctx.fx.emit(Fx.FlipCard, { card, seat: 0 });
    return acceptedAction({ ...state, stock, hole: [...state.hole, card] }, ctx);
  },
};

const recycleStock: Move<TripeaksState> = {
  validate(state) {
    const fault = playable(state);
    if (fault) return fault;
    if (!state.rules.recycle) return error('no-recycle', 'recycling is off');
    if (state.stock.length > 0)
      return error('stock-not-empty', 'finish the stock before recycling');
    if (state.hole.length <= 1) return error('hole-empty', 'there is nothing to recycle');
    return state.recycles < 1 ? true : error('no-recycles', 'no recycles remain');
  },
  apply(state, _seat, _payload, ctx) {
    const top = state.hole.at(-1) as CardId;
    const buried = state.hole.slice(0, -1);
    const stock = ctx.rng.shuffle(buried);
    ctx.fx.emit(Fx.ShuffleStock, { count: stock.length, shuffled: true });
    ctx.fx.emit(TripeaksFx.StockRecycle, { count: stock.length, pass: state.recycles + 1 });
    return acceptedAction({ ...state, stock, hole: [top], recycles: state.recycles + 1 }, ctx);
  },
};

export function legalMovesFor(state: TripeaksState): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  for (let from = 0; from < TABLEAU_SIZE; from++) {
    if (canPlayIndex(state, from)) {
      legal.push({ id: 'tableau.play', payload: { from } satisfies TableauPlayPayload });
    }
  }
  if (state.stock.length > 0) legal.push({ id: 'stock.flip' });
  else if (canRecycle(state)) legal.push({ id: 'stock.recycle' });
  return legal;
}

export function hintFor(state: TripeaksPlayerView): TripeaksHint | null {
  const legal = legalMovesFor(state);
  const play = legal.find((move) => move.id === 'tableau.play');
  if (play) return { move: play, reason: 'Play onto the hole.' };
  const flip = legal.find((move) => move.id === 'stock.flip');
  if (flip) return { move: flip, reason: 'Turn the next stock card.' };
  const recycle = legal.find((move) => move.id === 'stock.recycle');
  return recycle ? { move: recycle, reason: 'Shuffle the hole back into the stock.' } : null;
}

export function tripeaksPlayerView(state: TripeaksState): TripeaksPlayerView {
  return {
    ...state,
    stock: state.stock.map(() => '??'),
    hole: state.hole.slice(),
    tableau: state.tableau.slice(),
  };
}

const flow: GameDef<TripeaksState, TripeaksRules>['flow'] = {
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

export function createTripeaksDef(): GameDef<TripeaksState, TripeaksRules> {
  return {
    id: GAME_ID,
    configSchema: tripeaksConfig,
    howToPlay: tripeaksHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== TRIPEAKS_SEATS) {
        throw new Error('tripeaks requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'tableau.play': playTableau,
      'stock.flip': flipStock,
      'stock.recycle': recycleStock,
    },
    flow,
    playerView: tripeaksPlayerView,
    end: result,
    bots: [],
  };
}

export const tripeaksGame = createTripeaksDef();
