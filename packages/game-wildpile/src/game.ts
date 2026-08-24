import {
  Fx,
  addTo,
  defineConfig,
  drawFrom,
  removeFrom,
  shuffledIds,
  type BotPolicy,
  type CardId,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type Move,
  type MoveCtx,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import {
  WILDPILE_COLORS,
  sameWildpileFace,
  wildpileDeck,
  wildpileFace,
  type WildpileColor,
} from './deck';

export interface WildpileRules {
  stacking: boolean;
  jumpIn: boolean;
  [key: string]: ConfigFieldValue;
}

export interface WildpileInterrupt {
  resumeTurn: SeatId;
  card: CardId;
  candidates: SeatId[];
}

export interface WildpileState {
  seats: number;
  hands: CardId[][];
  stock: CardId[];
  discard: CardId[];
  turn: SeatId;
  direction: 1 | -1;
  activeColor: WildpileColor | null;
  pendingDraw: number;
  pendingKind: 'draw-two' | 'wild-draw-four' | null;
  awaitingColor: SeatId | null;
  interrupt: WildpileInterrupt | null;
  winner: SeatId | null;
  rules: WildpileRules;
}

export const wildpileConfig = defineConfig<WildpileRules>(
  [
    { key: 'stacking', kind: 'toggle', label: 'Stack draw cards', default: true },
    { key: 'jumpIn', kind: 'toggle', label: 'Jump in on exact matches', default: true },
  ],
  [
    { id: 'classic', label: 'Classic Wildpile', values: { stacking: false, jumpIn: false } },
    { id: 'party', label: 'Party Pile', values: { stacking: true, jumpIn: true } },
  ],
);

function error(code: string, message: string): RuleError {
  return { code, message };
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadColor(payload: unknown): WildpileColor | null {
  const color = (payload as { color?: unknown } | undefined)?.color;
  return WILDPILE_COLORS.includes(color as WildpileColor) ? (color as WildpileColor) : null;
}

function hand(state: WildpileState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function nextSeat(state: WildpileState, from: SeatId, steps = 1): SeatId {
  return (from + state.direction * steps + state.seats * steps) % state.seats;
}

function topCard(state: WildpileState): CardId {
  const card = state.discard[0];
  if (!card) throw new Error('wildpile discard cannot be empty');
  return card;
}

function canStack(state: WildpileState, card: CardId): boolean {
  const kind = wildpileFace(card).meta.kind;
  return (
    state.rules.stacking &&
    state.pendingKind !== null &&
    kind === state.pendingKind &&
    (kind === 'draw-two' || kind === 'wild-draw-four')
  );
}

function canPlay(state: WildpileState, card: CardId): boolean {
  const face = wildpileFace(card);
  if (state.pendingDraw > 0) return canStack(state, card);
  if (face.meta.kind === 'wild' || face.meta.kind === 'wild-draw-four') return true;
  if (face.color === state.activeColor) return true;
  const top = wildpileFace(topCard(state));
  if (face.meta.kind === 'number' && top.meta.kind === 'number') {
    return face.meta.value === top.meta.value;
  }
  return face.meta.kind === top.meta.kind;
}

function exactJumpCards(state: WildpileState, seat: SeatId): CardId[] {
  const target = state.interrupt?.card;
  if (!target) return [];
  return hand(state, seat).filter((card) => sameWildpileFace(card, target));
}

function phaseFor(state: WildpileState) {
  if (state.winner !== null) return { phase: 'ended', actor: null, round: 1 };
  if (state.awaitingColor !== null) {
    return { phase: 'choose-color', actor: state.awaitingColor, round: 1 };
  }
  const interrupter = state.interrupt?.candidates[0];
  if (interrupter !== undefined) return { phase: 'interrupt', actor: interrupter, round: 1 };
  return { phase: 'play', actor: state.turn, round: 1 };
}

function jumpCandidates(state: WildpileState, card: CardId, playingSeat: SeatId): SeatId[] {
  if (!state.rules.jumpIn) return [];
  const kind = wildpileFace(card).meta.kind;
  if (kind === 'wild' || kind === 'wild-draw-four') return [];
  const candidates: SeatId[] = [];
  for (let offset = 1; offset < state.seats; offset++) {
    const seat = (playingSeat + offset) % state.seats;
    if (hand(state, seat).some((held) => sameWildpileFace(held, card))) candidates.push(seat);
  }
  return candidates;
}

function withInterrupt(
  state: WildpileState,
  card: CardId,
  playingSeat: SeatId,
  resumeTurn: SeatId,
): WildpileState {
  const candidates = jumpCandidates(state, card, playingSeat);
  return {
    ...state,
    turn: candidates.length > 0 ? (candidates[0] as SeatId) : resumeTurn,
    interrupt: candidates.length > 0 ? { resumeTurn, card, candidates } : null,
  };
}

function validatePlayable(state: WildpileState, seat: SeatId, payload: unknown): true | RuleError {
  const card = payloadCard(payload);
  if (!card) return error('bad-payload', 'expected {card}');
  if (!hand(state, seat).includes(card)) return error('not-in-hand', `${card} is not in the hand`);
  if (state.awaitingColor !== null) return error('color-required', 'choose a color first');

  if (state.interrupt) {
    if (state.interrupt.candidates[0] !== seat)
      return error('not-interrupter', 'seat cannot jump in');
    return exactJumpCards(state, seat).includes(card)
      ? true
      : error('not-exact-match', 'jump-in requires an exact face match');
  }

  if (state.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
  return canPlay(state, card) ? true : error('card-not-playable', `${card} cannot be played`);
}

function playResolved(
  state: WildpileState,
  seat: SeatId,
  card: CardId,
  ctx: MoveCtx,
): WildpileState {
  const face = wildpileFace(card);
  const hands = state.hands.map((cards, index) =>
    index === seat ? removeFrom(cards, card) : cards.slice(),
  );
  ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });

  let next: WildpileState = {
    ...state,
    hands,
    discard: addTo(state.discard, card),
    activeColor: face.color ?? null,
    interrupt: null,
    winner: hands[seat]?.length === 0 ? seat : null,
  };

  if (face.meta.kind === 'wild' || face.meta.kind === 'wild-draw-four') {
    const amount = face.meta.kind === 'wild-draw-four' ? 4 : 0;
    if (amount > 0) {
      next = {
        ...next,
        pendingDraw: state.pendingDraw + amount,
        pendingKind: 'wild-draw-four',
      };
      ctx.fx.emit('wildpile.draw-stack', { seat, amount: next.pendingDraw });
    }
    ctx.fx.emit('wildpile.wild', { card, seat });
    return next.winner === null ? { ...next, awaitingColor: seat, turn: seat } : next;
  }

  let steps = 1;
  if (face.meta.kind === 'skip') {
    steps = 2;
    ctx.fx.emit('wildpile.skip', { seat: nextSeat(next, seat) });
  } else if (face.meta.kind === 'reverse') {
    next = { ...next, direction: state.direction === 1 ? -1 : 1 };
    steps = state.seats === 2 ? 2 : 1;
    ctx.fx.emit('wildpile.reverse', { direction: next.direction });
  } else if (face.meta.kind === 'draw-two') {
    next = {
      ...next,
      pendingDraw: state.pendingDraw + 2,
      pendingKind: 'draw-two',
    };
    ctx.fx.emit('wildpile.draw-stack', { seat, amount: next.pendingDraw });
  }

  const resumeTurn = nextSeat(next, seat, steps);
  if (next.winner !== null) return { ...next, turn: resumeTurn };
  const interrupted = withInterrupt(next, card, seat, resumeTurn);
  ctx.fx.emit(Fx.TurnRing, { seat: interrupted.turn }, 80);
  return interrupted;
}

const playCard: Move<WildpileState> = {
  validate: validatePlayable,
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload);
    if (!card) throw new Error('playCard apply requires a card');
    return playResolved(state, seat, card, ctx);
  },
};

function replenish(state: WildpileState, ctx: MoveCtx): WildpileState {
  if (state.stock.length > 0 || state.discard.length <= 1) return state;
  const [top, ...recyclable] = state.discard;
  ctx.fx.emit(Fx.ShuffleStock, {});
  return {
    ...state,
    stock: ctx.rng.shuffle(recyclable),
    discard: top ? [top] : [],
  };
}

function drawCards(state: WildpileState, seat: SeatId, count: number, ctx: MoveCtx): WildpileState {
  let next = state;
  const drawn: CardId[] = [];
  while (drawn.length < count) {
    next = replenish(next, ctx);
    if (next.stock.length === 0) break;
    const take = drawFrom(next.stock, count - drawn.length);
    drawn.push(...take.drawn);
    next = { ...next, stock: take.rest };
  }
  for (const card of drawn) ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' });
  return {
    ...next,
    hands: next.hands.map((cards, index) => (index === seat ? [...cards, ...drawn] : cards)),
  };
}

const draw: Move<WildpileState> = {
  validate(state, seat) {
    if (state.interrupt || state.awaitingColor !== null) {
      return error('draw-unavailable', 'draw is unavailable during this decision');
    }
    return state.turn === seat ? true : error('not-your-turn', 'seat is not taking this turn');
  },
  apply(state, seat, _payload, ctx) {
    const count = state.pendingDraw > 0 ? state.pendingDraw : 1;
    const drawn = drawCards(state, seat, count, ctx);
    const turn = nextSeat(drawn, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return {
      ...drawn,
      turn,
      pendingDraw: 0,
      pendingKind: null,
      interrupt: null,
    };
  },
};

const chooseColor: Move<WildpileState> = {
  validate(state, seat, payload) {
    if (state.awaitingColor !== seat)
      return error('color-not-awaited', 'seat is not choosing color');
    return payloadColor(payload) ? true : error('bad-color', 'expected a Wildpile color');
  },
  apply(state, seat, payload, ctx) {
    const color = payloadColor(payload);
    if (!color) throw new Error('chooseColor apply requires a color');
    const turn = nextSeat(state, seat);
    ctx.fx.emit('wildpile.color', { seat, color });
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...state, activeColor: color, awaitingColor: null, turn };
  },
};

const declineJump: Move<WildpileState> = {
  validate(state, seat) {
    return state.interrupt?.candidates[0] === seat
      ? true
      : error('not-interrupter', 'seat has no jump-in decision');
  },
  apply(state, _seat, _payload, ctx) {
    if (!state.interrupt) throw new Error('declineJump apply requires an interrupt');
    const candidates = state.interrupt.candidates.slice(1);
    const turn = candidates[0] ?? state.interrupt.resumeTurn;
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 40);
    return {
      ...state,
      turn,
      interrupt: candidates.length > 0 ? { ...state.interrupt, candidates } : null,
    };
  },
};

function legalMoves(state: WildpileState): LegalMove[] {
  if (state.winner !== null) return [];
  if (state.awaitingColor !== null) {
    return WILDPILE_COLORS.map((color) => ({ id: 'chooseColor', payload: { color } }));
  }
  if (state.interrupt) {
    const actor = state.interrupt.candidates[0];
    if (actor === undefined) return [];
    return [
      ...exactJumpCards(state, actor).map((card) => ({ id: 'playCard', payload: { card } })),
      { id: 'declineJump' },
    ];
  }
  return [
    ...hand(state, state.turn)
      .filter((card) => canPlay(state, card))
      .map((card) => ({ id: 'playCard', payload: { card } })),
    { id: 'draw' },
  ];
}

function result(state: WildpileState): MatchResult | null {
  if (state.winner === null) return null;
  const rankings = state.hands
    .map((cards, seat) => ({ seat, cards: cards.length }))
    .sort((a, b) => a.cards - b.cards || a.seat - b.seat)
    .map((entry, index) => ({
      seat: entry.seat,
      rank: entry.seat === state.winner ? 1 : index + 1,
      detail: { cards: entry.cards },
    }));
  return { winner: state.winner, rankings, reason: 'hand-emptied' };
}

const flow: Flow<WildpileState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMoves(state) {
    return legalMoves(state);
  },
  advance(state) {
    const ended = result(state);
    return ended ? { phase: phaseFor(state), ended } : { phase: phaseFor(state) };
  },
};

function preferredColor(state: WildpileState, seat: SeatId): WildpileColor {
  const counts = new Map<WildpileColor, number>(WILDPILE_COLORS.map((color) => [color, 0]));
  for (const card of hand(state, seat)) {
    const color = wildpileFace(card).color;
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return WILDPILE_COLORS.reduce((best, color) =>
    (counts.get(color) ?? 0) > (counts.get(best) ?? 0) ? color : best,
  );
}

const bot: BotPolicy<WildpileState> = {
  id: 'wildpile-house-bot',
  label: 'House Bot',
  tier: 2,
  chooseMove(state, seat, legal) {
    const color = preferredColor(state, seat);
    const colorMove = legal.find(
      (move) =>
        move.id === 'chooseColor' &&
        (move.payload as { color?: unknown } | undefined)?.color === color,
    );
    if (colorMove) return colorMove;
    return (
      legal.find((move) => move.id === 'playCard') ??
      legal.find((move) => move.id === 'declineJump') ??
      legal[0] ??
      null
    );
  },
};

export const wildpileGame: GameDef<WildpileState, WildpileRules> = {
  id: 'wildpile',
  configSchema: wildpileConfig,
  setup({ config, seats, rng, fx }) {
    if (!Number.isInteger(seats) || seats < 2 || seats > 4) {
      throw new Error('wildpile requires 2–4 seats');
    }
    const shuffled = shuffledIds(wildpileDeck, rng);
    const hands: CardId[][] = Array.from({ length: seats }, () => []);
    let cursor = 0;
    for (let round = 0; round < 7; round++) {
      for (let seat = 0; seat < seats; seat++) {
        const card = shuffled[cursor++];
        if (!card) throw new Error('wildpile deck exhausted during deal');
        hands[seat]?.push(card);
        fx.emit(
          Fx.DealCard,
          { card, from: 'stock', to: `hand:${seat}`, dur: 180 },
          (cursor - 1) * 70,
        );
      }
    }
    const starterIndex = shuffled.findIndex(
      (card, index) => index >= cursor && wildpileFace(card).meta.kind === 'number',
    );
    if (starterIndex < 0) throw new Error('wildpile deck has no numeric starter');
    const starter = shuffled[starterIndex] as CardId;
    const stock = shuffled.slice(cursor);
    stock.splice(starterIndex - cursor, 1);
    fx.emit(Fx.FlipCard, { card: starter, to: 'discard' }, cursor * 70);
    return {
      seats,
      hands,
      stock,
      discard: [starter],
      turn: 0,
      direction: 1,
      activeColor: wildpileFace(starter).color ?? null,
      pendingDraw: 0,
      pendingKind: null,
      awaitingColor: null,
      interrupt: null,
      winner: null,
      rules: config,
    };
  },
  moves: { playCard, draw, chooseColor, declineJump },
  flow,
  playerView(state, seat) {
    return {
      ...state,
      hands: state.hands.map((cards, index) =>
        index === seat ? cards.slice() : cards.map(() => '??'),
      ),
      stock: state.stock.map(() => '??'),
    };
  },
  end: result,
  bots: [bot],
};
