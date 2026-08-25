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
  PYRAMID_ROWS,
  PYRAMID_SEATS,
  clonePyramid,
  emptyPyramid,
  isFree,
  isKing,
  occupyCount,
  rankValue,
  validCell,
} from './cards';
import { pyramidConfig, type PyramidRules } from './config';
import { pyramidHowToPlay } from './howto';
import type {
  PairPayload,
  PyramidPlayerView,
  PyramidSource,
  PyramidState,
  RemovePayload,
} from './state';

export const GAME_ID = 'pyramid';

const DEAL_STAGGER_MS = 40;

export const PyramidFx = {
  StockDraw: 'pyramid.stock-draw',
  StockRecycle: 'pyramid.stock-recycle',
  Pair: 'pyramid.pair',
  Remove: 'pyramid.remove',
  HoleOut: 'pyramid.hole-out',
  Win: 'pyramid.win',
} as const;

export interface PyramidHint {
  move: LegalMove;
  reason: string;
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

export function leftoverOf(state: {
  pyramid: readonly (readonly (string | null)[])[];
  stock: readonly unknown[];
  waste: readonly unknown[];
}): number {
  return occupyCount(state.pyramid) + state.stock.length + state.waste.length;
}

export function canRecycle(
  state: Pick<PyramidState, 'rules' | 'stock' | 'waste' | 'recycles'>,
): boolean {
  if (state.stock.length > 0 || state.waste.length === 0) return false;
  return state.rules.recyclesLimit === -1 || state.recycles < state.rules.recyclesLimit;
}

function playable(state: PyramidState): RuleError | null {
  return state.stage === 'playing' ? null : error('game-over', 'this pyramid is already complete');
}

function phaseFor(state: PyramidState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'playing' ? 0 : null,
    round: 1,
  };
}

function result(state: PyramidState): MatchResult | null {
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
    reason: cleared ? `cleared in ${state.moves} moves` : `${leftover} leftover`,
  };
}

function parseSource(value: unknown): PyramidSource | null {
  if (value === 'waste') return 'waste';
  if (!value || typeof value !== 'object') return null;
  const cell = value as { row?: unknown; col?: unknown };
  if (!validCell(cell.row, cell.col)) return null;
  return { row: Number(cell.row), col: Number(cell.col) };
}

function pairPayload(payload: unknown): PairPayload | null {
  const input = payload as Partial<PairPayload> | undefined;
  const a = parseSource(input?.a);
  const b = parseSource(input?.b);
  return a && b ? { a, b } : null;
}

function removePayload(payload: unknown): RemovePayload | null {
  const from = parseSource((payload as Partial<RemovePayload> | undefined)?.from);
  return from ? { from } : null;
}

function sameSource(a: PyramidSource, b: PyramidSource): boolean {
  if (a === 'waste' || b === 'waste') return a === b;
  return a.row === b.row && a.col === b.col;
}

function cardAt(
  state: Pick<PyramidState, 'pyramid' | 'waste'>,
  source: PyramidSource,
): CardId | null {
  if (source === 'waste') return state.waste.at(-1) ?? null;
  return state.pyramid[source.row]?.[source.col] ?? null;
}

function sourceFree(
  state: Pick<PyramidState, 'pyramid' | 'waste'>,
  source: PyramidSource,
): boolean {
  if (source === 'waste') return state.waste.length > 0;
  return isFree(state.pyramid, source.row, source.col);
}

function zoneOf(source: PyramidSource): string {
  return source === 'waste' ? 'waste' : `pyramid:${source.row}:${source.col}`;
}

function takeCard(
  state: PyramidState,
  source: PyramidSource,
): { pyramid: (CardId | null)[][]; waste: CardId[]; card: CardId } {
  if (source === 'waste') {
    const waste = state.waste.slice();
    const card = waste.pop() as CardId;
    return { pyramid: clonePyramid(state.pyramid), waste, card };
  }
  const pyramid = clonePyramid(state.pyramid);
  const card = pyramid[source.row]![source.col] as CardId;
  pyramid[source.row]![source.col] = null;
  return { pyramid, waste: state.waste.slice(), card };
}

function finishIfStuck(state: PyramidState, ctx: MoveCtx): PyramidState {
  const leftover = leftoverOf(state);
  if (leftover === 0) {
    ctx.fx.emit(PyramidFx.Win, { moves: state.moves, leftover: 0 }, 160);
    ctx.fx.emit(Fx.RoundEnd, { reason: 'cleared' }, 240);
    return { ...state, stage: 'won' };
  }
  if (hasPairOrRemove(state) || state.stock.length > 0 || canRecycle(state)) return state;
  ctx.fx.emit(PyramidFx.HoleOut, { leftover, moves: state.moves }, 120);
  ctx.fx.emit(Fx.RoundEnd, { reason: 'hole-complete' }, 200);
  return { ...state, stage: 'holed' };
}

function acceptedAction(state: PyramidState, ctx: MoveCtx): PyramidState {
  return finishIfStuck({ ...state, moves: state.moves + 1 }, ctx);
}

function deal(ctx: Parameters<GameDef<PyramidState, PyramidRules>['setup']>[0]): PyramidState {
  const order = ctx.rng.shuffle([...DECK.cardIds]);
  const pyramid = emptyPyramid();
  let cursor = 0;
  for (let row = 0; row < PYRAMID_ROWS; row++) {
    for (let col = 0; col <= row; col++) {
      const card = order[cursor++] as CardId;
      pyramid[row]![col] = card;
      ctx.fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `pyramid:${row}:${col}`, faceDown: false, dur: 200 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  return {
    rules: ctx.config,
    stage: 'playing',
    pyramid,
    stock: order.slice(cursor),
    waste: [],
    moves: 0,
    recycles: 0,
  };
}

function validatePair(state: PyramidState, _seat: number, payload: unknown): true | RuleError {
  const fault = playable(state);
  if (fault) return fault;
  const input = pairPayload(payload);
  if (!input) return error('bad-pair', 'expected {a, b} as cells or waste');
  if (input.a === 'waste' && input.b === 'waste')
    return error('waste-waste', 'only the top waste card is live');
  if (sameSource(input.a, input.b)) return error('same-source', 'pair two different cards');
  if (!sourceFree(state, input.a) || !sourceFree(state, input.b))
    return error('covered', 'that card is still covered');
  const left = cardAt(state, input.a);
  const right = cardAt(state, input.b);
  if (!left || !right) return error('empty-source', 'that slot has no card');
  if (isKing(left) || isKing(right)) return error('use-remove', 'a King removes alone');
  return rankValue(left) + rankValue(right) === 13
    ? true
    : error('bad-sum', 'those ranks do not add to 13');
}

const pairCards: Move<PyramidState> = {
  validate: validatePair,
  apply(state, _seat, payload, ctx) {
    const input = pairPayload(payload) as PairPayload;
    const first = takeCard(state, input.a);
    const second = takeCard({ ...state, pyramid: first.pyramid, waste: first.waste }, input.b);
    ctx.fx.emit(PyramidFx.Pair, {
      cards: [first.card, second.card],
      from: [zoneOf(input.a), zoneOf(input.b)],
    });
    ctx.fx.emit(Fx.DealCard, {
      card: first.card,
      from: zoneOf(input.a),
      to: 'out',
      faceDown: false,
      dur: 200,
    });
    ctx.fx.emit(
      Fx.DealCard,
      { card: second.card, from: zoneOf(input.b), to: 'out', faceDown: false, dur: 200 },
      40,
    );
    return acceptedAction({ ...state, pyramid: second.pyramid, waste: second.waste }, ctx);
  },
};

function validateRemove(state: PyramidState, _seat: number, payload: unknown): true | RuleError {
  const fault = playable(state);
  if (fault) return fault;
  const input = removePayload(payload);
  if (!input) return error('bad-remove', 'expected {from} as a cell or waste');
  if (!sourceFree(state, input.from)) return error('covered', 'that card is still covered');
  const card = cardAt(state, input.from);
  if (!card) return error('empty-source', 'that slot has no card');
  return isKing(card) ? true : error('not-king', 'only a King removes alone');
}

const removeKing: Move<PyramidState> = {
  validate: validateRemove,
  apply(state, _seat, payload, ctx) {
    const input = removePayload(payload) as RemovePayload;
    const next = takeCard(state, input.from);
    ctx.fx.emit(PyramidFx.Remove, { card: next.card, from: zoneOf(input.from) });
    ctx.fx.emit(Fx.DealCard, {
      card: next.card,
      from: zoneOf(input.from),
      to: 'out',
      faceDown: false,
      dur: 200,
    });
    return acceptedAction({ ...state, pyramid: next.pyramid, waste: next.waste }, ctx);
  },
};

const drawStock: Move<PyramidState> = {
  validate(state) {
    return (
      playable(state) ??
      (state.stock.length > 0 ? true : error('stock-empty', 'recycle the waste first'))
    );
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const card = stock.pop() as CardId;
    ctx.fx.emit(PyramidFx.StockDraw, { card, count: 1 });
    ctx.fx.emit(Fx.DrawCard, { card, seat: 0, from: 'stock', to: 'waste', dur: 180 });
    return acceptedAction({ ...state, stock, waste: [...state.waste, card] }, ctx);
  },
};

const recycleStock: Move<PyramidState> = {
  validate(state) {
    const fault = playable(state);
    if (fault) return fault;
    if (state.stock.length > 0)
      return error('stock-not-empty', 'finish the stock before recycling');
    if (state.waste.length === 0)
      return error('waste-empty', 'there are no waste cards to recycle');
    return canRecycle(state) ? true : error('no-recycles', 'no recycles remain');
  },
  apply(state, _seat, _payload, ctx) {
    const stock = state.waste.slice().reverse();
    ctx.fx.emit(Fx.ShuffleStock, { count: stock.length, shuffled: false });
    ctx.fx.emit(PyramidFx.StockRecycle, { count: stock.length, pass: state.recycles + 1 });
    return acceptedAction({ ...state, stock, waste: [], recycles: state.recycles + 1 }, ctx);
  },
};

function freeSources(state: Pick<PyramidState, 'pyramid' | 'waste'>): PyramidSource[] {
  const sources: PyramidSource[] = [];
  for (let row = 0; row < PYRAMID_ROWS; row++) {
    for (let col = 0; col <= row; col++) {
      if (isFree(state.pyramid, row, col)) sources.push({ row, col });
    }
  }
  if (state.waste.length > 0) sources.push('waste');
  return sources;
}

function hasPairOrRemove(state: Pick<PyramidState, 'pyramid' | 'waste'>): boolean {
  const sources = freeSources(state);
  for (let i = 0; i < sources.length; i++) {
    const left = cardAt(state, sources[i] as PyramidSource);
    if (!left) continue;
    if (isKing(left)) return true;
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i] as PyramidSource;
      const b = sources[j] as PyramidSource;
      if (a === 'waste' && b === 'waste') continue;
      const right = cardAt(state, b);
      if (right && !isKing(right) && rankValue(left) + rankValue(right) === 13) return true;
    }
  }
  return false;
}

export function legalMovesFor(state: PyramidState): LegalMove[] {
  if (state.stage !== 'playing') return [];
  const legal: LegalMove[] = [];
  const sources = freeSources(state);
  for (let i = 0; i < sources.length; i++) {
    const a = sources[i] as PyramidSource;
    const left = cardAt(state, a);
    if (!left) continue;
    if (isKing(left)) {
      legal.push({ id: 'pyramid.remove', payload: { from: a } satisfies RemovePayload });
      continue;
    }
    for (let j = i + 1; j < sources.length; j++) {
      const b = sources[j] as PyramidSource;
      if (a === 'waste' && b === 'waste') continue;
      const right = cardAt(state, b);
      if (!right || isKing(right)) continue;
      if (rankValue(left) + rankValue(right) === 13) {
        legal.push({ id: 'pyramid.pair', payload: { a, b } satisfies PairPayload });
      }
    }
  }
  if (state.stock.length > 0) legal.push({ id: 'stock.draw' });
  else if (canRecycle(state)) legal.push({ id: 'stock.recycle' });
  return legal;
}

function uncoverCount(
  state: Pick<PyramidState, 'pyramid' | 'waste'>,
  removed: readonly PyramidSource[],
): number {
  const pyramid = clonePyramid(state.pyramid);
  for (const source of removed) {
    if (source === 'waste') continue;
    if (pyramid[source.row]) pyramid[source.row]![source.col] = null;
  }
  let count = 0;
  for (let row = 0; row < PYRAMID_ROWS - 1; row++) {
    for (let col = 0; col <= row; col++) {
      if (!state.pyramid[row]?.[col]) continue;
      if (isFree(state.pyramid, row, col)) continue;
      if (isFree(pyramid, row, col)) count += 1;
    }
  }
  return count;
}

export function hintFor(state: PyramidPlayerView): PyramidHint | null {
  const legal = legalMovesFor(state);
  const kings = legal.filter((move) => move.id === 'pyramid.remove');
  if (kings[0]) {
    const best = kings.reduce((lead, move) => {
      const from = (move.payload as RemovePayload).from;
      return uncoverCount(state, [from]) >
        uncoverCount(state, [(lead.payload as RemovePayload).from])
        ? move
        : lead;
    }, kings[0]);
    return { move: best, reason: 'Remove the King.' };
  }
  const pairs = legal.filter((move) => move.id === 'pyramid.pair');
  if (pairs[0]) {
    const best = pairs.reduce((lead, move) => {
      const payload = move.payload as PairPayload;
      const score = uncoverCount(state, [payload.a, payload.b]);
      const leadScore = uncoverCount(state, [
        (lead.payload as PairPayload).a,
        (lead.payload as PairPayload).b,
      ]);
      return score > leadScore ? move : lead;
    }, pairs[0]);
    return { move: best, reason: 'Pair ranks that sum to 13.' };
  }
  const draw = legal.find((move) => move.id === 'stock.draw');
  if (draw) return { move: draw, reason: 'Turn the next stock card.' };
  const recycle = legal.find((move) => move.id === 'stock.recycle');
  return recycle ? { move: recycle, reason: 'Flip the waste back into the stock.' } : null;
}

export function pyramidPlayerView(state: PyramidState): PyramidPlayerView {
  return {
    ...state,
    stock: state.stock.map(() => '??'),
    waste: state.waste.slice(),
    pyramid: clonePyramid(state.pyramid),
  };
}

const flow: GameDef<PyramidState, PyramidRules>['flow'] = {
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

export function createPyramidDef(): GameDef<PyramidState, PyramidRules> {
  return {
    id: GAME_ID,
    configSchema: pyramidConfig,
    howToPlay: pyramidHowToPlay,
    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== PYRAMID_SEATS) {
        throw new Error('pyramid requires exactly one seat');
      }
      return deal(ctx);
    },
    moves: {
      'pyramid.pair': pairCards,
      'pyramid.remove': removeKing,
      'stock.draw': drawStock,
      'stock.recycle': recycleStock,
    },
    flow,
    playerView: pyramidPlayerView,
    end: result,
    bots: [],
  };
}

export const pyramidGame = createPyramidDef();
