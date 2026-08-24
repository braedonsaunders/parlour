import {
  Fx,
  type BotPolicy,
  type CardId,
  type Flow,
  type FxEmitter,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
  type SetupCtx,
  dealOrder,
  veilSupport,
} from '@parlour/engine';
import { presidentHowToPlay } from './howto';
import {
  MAX_SET_SIZE,
  MIN_SET_SIZE,
  PRESIDENT_DECK,
  TWO_ORDER,
  isSameRank,
  tryOrder,
} from './deck';
import { PresidentState, StandingSet, type PresidentRole } from './state';
import { PresidentRules, presidentConfig } from './config';
import { presidentBots } from './bots';

export const GAME_ID = 'president';
/** The table shell supports 2–8 seats; President fills the upper half of that ring. */
export const MIN_SEATS = 4;
export const MAX_SEATS = 8;

export {
  presidentConfig,
  DEFAULT_TARGET_POINTS,
  MAX_TARGET_POINTS,
  MIN_TARGET_POINTS,
  type PresidentRules,
} from './config';
export type { ExchangeMove, PresidentRole, PresidentState, StandingSet } from './state';
export { PRESIDENT_DECK, MAX_SET_SIZE, MIN_SET_SIZE, TWO_ORDER, orderOf } from './deck';

/** Namespaced fx accents — audio maps live in apps/web/src/lib/audio/game-cues.ts. */
export const PresidentFx = {
  Set: 'president.set', // {seat, count, rank}
  Pass: 'president.pass', // {seat}
  PileClear: 'president.pile-clear', // {seat, reason:'passed-out'|'two-clear'}
  Role: 'president.role', // {seat, role, deal}
  Out: 'president.out', // {seat, place}
  Exchange: 'president.exchange', // {fromSeat, toSeat, count}
} as const;

const DEAL_STAGGER_MS = 32;
const SET_STAGGER_MS = 40;
const ROLE_STAGGER_MS = 140;

function error(code: string, message: string): RuleError {
  return { code, message };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function handOf(state: PresidentState, seat: SeatId): readonly CardId[] {
  return state.hands[seat] ?? [];
}

/** Seats still holding cards in the live deal, in seat order. */
export function activeSeats(state: PresidentState): SeatId[] {
  const out: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.finished.includes(seat) && handOf(state, seat).length > 0) out.push(seat);
  }
  return out;
}

function nextActiveSeat(state: PresidentState, from: SeatId): SeatId | null {
  const active = activeSeats(state);
  for (let step = 1; step <= state.seats; step++) {
    const seat = (from + step) % state.seats;
    if (active.includes(seat)) return seat;
  }
  return active[0] ?? null;
}

/** Finish-order role lookup: index 0 is president, the last index is scum. */
export function roleFor(order: readonly SeatId[], seat: SeatId): PresidentRole | null {
  const index = order.indexOf(seat);
  if (index < 0) return null;
  const last = order.length - 1;
  if (index === 0) return 'president';
  if (index === 1) return 'vice';
  if (index === last) return 'scum';
  if (index === last - 1) return 'vice-scum';
  return 'neutral';
}

/** Cards a role donates from their fresh hand at the start of the next deal. */
export function giftCountFor(role: PresidentRole): number {
  if (role === 'scum') return 2;
  if (role === 'vice-scum') return 1;
  return 0;
}

function counterpartOf(order: readonly SeatId[], seat: SeatId): SeatId | null {
  const index = order.indexOf(seat);
  const mirrored = order.length - 1 - index;
  if (index < 0 || mirrored === index || mirrored < 0 || mirrored >= order.length) return null;
  return order[mirrored]!;
}

export function pointsForFinish(seats: number, finishIndex: number): number {
  return seats - finishIndex;
}

/** True once any seat has banked the configured target. */
export function matchOver(state: PresidentState): boolean {
  return state.score.some((points) => points >= state.rules.targetPoints);
}

function rankingsByScore(state: PresidentState): MatchResultRank[] {
  const ordered = state.score
    .map((points, seat) => ({ seat, points }))
    .sort((a, b) => b.points - a.points || a.seat - b.seat);
  let priorPoints: number | null = null;
  let priorRank = 0;
  return ordered.map(({ seat, points }, index) => {
    if (points !== priorPoints) priorRank = index + 1;
    priorPoints = points;
    return { seat, rank: priorRank, detail: { points } };
  });
}

export function matchResult(state: PresidentState): MatchResult {
  const rankings = rankingsByScore(state);
  const champion = rankings.find((entry) => entry.rank === 1);
  const points = champion?.detail?.points;
  return {
    winner: typeof points === 'number' && points > 0 ? (champion!.seat as SeatId) : null,
    rankings,
    reason: 'points-target',
  };
}

export function phaseFor(state: PresidentState): PhaseState {
  const round = state.deal + 1;
  if (matchOver(state)) return { phase: 'ended', actor: null, round };
  if (state.awaitingGive.length > 0) {
    return {
      phase: 'exchange-give',
      actor: state.awaitingGive[0] ?? null,
      actors: state.awaitingGive,
      round,
      label: 'card exchange',
    };
  }
  if (state.awaitingReturn) {
    return {
      phase: 'exchange-return',
      actor: state.awaitingReturn.seat,
      round,
      label: 'returning cards',
    };
  }
  return { phase: 'play', actor: state.turn, round };
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

function sortKey(card: CardId): number {
  const rank = tryOrder(card);
  // Handles sort after every face with a stable tiebreak, so the shared
  // veiled state hashes identically on every peer.
  return rank ?? 100 + (card.charCodeAt(2) ?? 0);
}

function sortedHand(cards: readonly CardId[]): CardId[] {
  return [...cards].sort((a, b) => sortKey(a) - sortKey(b) || a.localeCompare(b));
}

/**
 * Deals `order` round-robin starting at a seeded seat, so odd table sizes do
 * not systematically favour seat 0. Emits the opening flight timeline.
 */
function dealHands(
  seats: number,
  order: readonly CardId[],
  startSeat: SeatId,
  fx: FxEmitter,
): CardId[][] {
  const hands: CardId[][] = Array.from({ length: seats }, () => []);
  let cursor = 0;
  for (let slot = 0; slot < order.length; slot++) {
    const seat = (startSeat + slot) % seats;
    const card = order[cursor++]!;
    hands[seat]!.push(card);
    fx.emit(Fx.DealCard, { card, from: 'stock', to: `hand:${seat}`, dur: 170 }, cursor * DEAL_STAGGER_MS);
  }
  return hands.map(sortedHand);
}

function freshTrick() {
  return {
    pile: [] as CardId[],
    standing: null as StandingSet | null,
    passedCycle: [] as SeatId[],
    lockedOut: [] as SeatId[],
  };
}

/** Every card id in play — hands, the live pile, and swept dead cards. */
function collectCards(state: PresidentState): CardId[] {
  return [...state.hands.flat(), ...state.pile, ...state.captured];
}

/** Seats owing a gift this transition, in finish order (vice-scum before scum). */
function exchangeGivers(state: PresidentState): SeatId[] {
  if (!state.rules.trading || state.seats < 4 || !state.lastOrder) return [];
  const order = state.lastOrder;
  return order.filter((seat) => giftCountFor(roleFor(order, seat) ?? 'neutral') > 0);
}

interface DealContext extends MoveCtx {
  /** Veil ceremony order — present on the opening deal of a veiled room. */
  deckOrder?: readonly CardId[];
}

/**
 * Opens a fresh deal inside the same session. The opening deal draws from the
 * ceremony deck order (a real shuffle in open rooms); later deals reshuffle
 * the conserved cards already in play, which keeps veiled rooms private —
 * opaque handles stay opaque, they merely change owner.
 */
function openDeal(state: PresidentState, ctx: DealContext): PresidentState {
  const pool =
    state.deal < 0
      ? dealOrder({ rng: ctx.rng, deckOrder: ctx.deckOrder }, PRESIDENT_DECK)
      : collectCards(state);
  const shuffled = ctx.rng.shuffle(pool);
  const startSeat = ctx.rng.int(state.seats);
  const mid: PresidentState = {
    ...state,
    ...freshTrick(),
    captured: [],
    finished: [],
    awaitingGive: [],
    awaitingReturn: null,
    exchangeLog: [],
    turn: null,
    deal: state.deal + 1,
    hands: dealHands(state.seats, shuffled, startSeat, ctx.fx),
  };
  const givers = exchangeGivers(mid);
  if (givers.length > 0) return { ...mid, awaitingGive: givers };
  // Deal one opens with the starting seat; later deals open with the president.
  const leader = mid.lastOrder ? mid.lastOrder[0]! : startSeat;
  ctx.fx.emit(Fx.TurnRing, { seat: leader }, 80);
  return { ...mid, turn: leader };
}

/** Awards position points, crowns roles, and closes the finished deal. */
function completeDeal(state: PresidentState, ctx: MoveCtx): PresidentState {
  const finished = [...state.finished];
  for (const seat of activeSeats(state)) finished.push(seat);
  const score = state.score.slice();
  finished.forEach((seat, index) => {
    score[seat] = (score[seat] ?? 0) + pointsForFinish(state.seats, index);
  });
  finished.forEach((seat, index) => {
    const role = roleFor(finished, seat) ?? 'neutral';
    ctx.fx.emit(PresidentFx.Role, { seat, role, deal: state.deal }, index * ROLE_STAGGER_MS);
  });
  ctx.fx.emit(Fx.RoundEnd, { reason: 'deal-complete' }, finished.length * ROLE_STAGGER_MS);
  return {
    ...state,
    ...freshTrick(),
    captured: [...state.captured, ...state.pile],
    finished,
    score,
    lastOrder: finished,
    awaitingGive: [],
    awaitingReturn: null,
    exchangeLog: [],
    turn: null,
  };
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function payloadCardList(payload: unknown): CardId[] | null {
  const raw = (payload as { cards?: unknown } | undefined)?.cards;
  if (!Array.isArray(raw)) return null;
  const cards: CardId[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) return null;
    cards.push(entry);
  }
  return cards;
}

function heldOnce(hand: readonly CardId[], cards: readonly CardId[]): boolean {
  const seen = new Set<CardId>();
  for (const card of cards) {
    if (!hand.includes(card) || seen.has(card)) return false;
    seen.add(card);
  }
  return true;
}

/**
 * One representative set per (rank, size) present in the hand — the cards are
 * interchangeable, so enumerating every subset would only bloat the list.
 */
function enumerableSets(
  state: PresidentState,
  seat: SeatId,
): { cards: CardId[]; size: number; rank: number }[] {
  const byRank = new Map<number, CardId[]>();
  for (const card of handOf(state, seat)) {
    const rank = tryOrder(card);
    if (rank === null) continue; // opaque handles are never enumerated
    const bucket = byRank.get(rank) ?? [];
    bucket.push(card);
    byRank.set(rank, bucket);
  }
  const size = state.standing?.cards.length ?? 0;
  const sizes: readonly number[] =
    state.standing === null ? [1, 2, 3, 4] : [Math.min(Math.max(size, MIN_SET_SIZE), MAX_SET_SIZE)];
  const floor = state.standing ? state.standing.rank : 0;
  const sets: { cards: CardId[]; size: number; rank: number }[] = [];
  for (const [rank, cards] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    if (state.standing && rank <= floor) continue;
    for (const count of sizes) {
      if (count > cards.length) continue;
      sets.push({ cards: sortedHand(cards).slice(0, count), size: count, rank });
    }
  }
  return sets;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/** Rivals who may still respond to the standing set during this trick. */
function undecidedRivals(state: PresidentState): SeatId[] {
  if (!state.standing) return [];
  const winner = state.standing.seat;
  return activeSeats(state).filter(
    (seat) => seat !== winner && !state.passedCycle.includes(seat) && !state.lockedOut.includes(seat),
  );
}

function removeFromHand(
  hands: readonly (readonly CardId[])[],
  seat: SeatId,
  cards: readonly CardId[],
): CardId[][] {
  return hands.map((hand, index) =>
    index === seat ? hand.filter((card) => !cards.includes(card)) : [...hand],
  );
}

function addToHand(
  hands: readonly (readonly CardId[])[],
  seat: SeatId,
  cards: readonly CardId[],
): CardId[][] {
  return hands.map((hand, index) =>
    index === seat ? sortedHand([...hand, ...cards]) : [...hand],
  );
}

/**
 * Sweeps a won pile and seats the next leader. A winner who just went out
 * hands the lead to the next active seat clockwise.
 */
function sweepPile(
  state: PresidentState,
  winner: SeatId,
  reason: string,
  ctx: MoveCtx,
): PresidentState {
  ctx.fx.emit(PresidentFx.PileClear, { seat: winner, reason });
  const swept: PresidentState = {
    ...state,
    ...freshTrick(),
    captured: [...state.captured, ...state.pile],
  };
  const leader = state.finished.includes(winner) ? nextActiveSeat(swept, winner) : winner;
  return { ...swept, turn: leader };
}

const playSet: Move<PresidentState> = {
  validate(state, seat, payload) {
    if (phaseFor(state).phase !== 'play') {
      return error('not-playing', 'the table is not accepting plays right now');
    }
    if (state.turn !== seat) return error('not-your-turn', 'it is another seat’s turn');
    const cards = payloadCardList(payload);
    if (!cards || cards.length === 0) return error('bad-payload', 'expected {cards: string[]}');
    if (!heldOnce(handOf(state, seat), cards)) {
      return error('not-in-hand', 'every played card must be held once');
    }
    if (!isSameRank(cards)) return error('mixed-ranks', 'a set must share one table rank');
    const rank = tryOrder(cards[0]!)!;
    if (rank > TWO_ORDER) return error('bad-set', 'unknown rank');
    if (state.standing) {
      if (cards.length !== state.standing.cards.length) {
        return error('size-mismatch', `must play ${state.standing.cards.length} card(s)`);
      }
      if (rank <= state.standing.rank) {
        return error('not-higher', 'the set must outrank the pile');
      }
    } else if (cards.length > MAX_SET_SIZE) {
      return error('bad-set', `sets hold at most ${MAX_SET_SIZE} cards`);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const cards = payloadCardList(payload)!;
    const rank = tryOrder(cards[0]!)!;
    const hands = removeFromHand(state.hands, seat, cards);
    cards.forEach((card, index) => {
      ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' }, index * SET_STAGGER_MS);
    });
    ctx.fx.emit(PresidentFx.Set, { seat, count: cards.length, rank });

    let next: PresidentState = {
      ...state,
      hands,
      pile: [...state.pile, ...cards],
      standing: { seat, cards, rank },
      passedCycle: [],
    };

    const wentOut = handOf(next, seat).length === 0;
    if (wentOut) {
      next = { ...next, finished: [...next.finished, seat] };
      ctx.fx.emit(PresidentFx.Out, { seat, place: next.finished.length }, SET_STAGGER_MS * 2);
    }

    const clearsPile =
      next.rules.twoClears && cards.length === 1 && rank === TWO_ORDER
        ? 'two-clear'
        : undecidedRivals(next).length === 0
          ? 'passed-out'
          : null;

    if (clearsPile) {
      next = sweepPile(next, seat, clearsPile, ctx);
      ctx.fx.emit(Fx.TurnRing, { seat: next.turn ?? seat }, 80);
    } else {
      next = { ...next, turn: nextActiveSeat(next, seat) };
      ctx.fx.emit(Fx.TurnRing, { seat: next.turn ?? seat }, 80);
    }

    if (next.finished.length >= next.seats - 1) {
      next = completeDeal(next, ctx);
    }
    return next;
  },
};

const pass: Move<PresidentState> = {
  validate(state, seat) {
    if (phaseFor(state).phase !== 'play') return error('not-playing', 'nothing to pass on');
    if (state.turn !== seat) return error('not-your-turn', 'it is another seat’s turn');
    if (!state.standing) return error('lead-required', 'the leader must open the trick');
    if (state.passedCycle.includes(seat)) return error('already-passed', 'this seat already passed');
    if (state.lockedOut.includes(seat)) return error('locked-out', 'this seat is out of the trick');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(PresidentFx.Pass, { seat });
    let next: PresidentState = {
      ...state,
      passedCycle: [...state.passedCycle, seat],
      lockedOut: state.rules.passLocks ? [...state.lockedOut, seat] : state.lockedOut,
    };
    if (undecidedRivals(next).length === 0 && next.standing) {
      const winner = next.standing.seat;
      next = sweepPile(next, winner, 'passed-out', ctx);
    } else {
      next = { ...next, turn: nextActiveSeat(next, seat) };
    }
    ctx.fx.emit(Fx.TurnRing, { seat: next.turn ?? seat }, 80);
    return next;
  },
};

function exchangeFlight(ctx: MoveCtx, from: SeatId, to: SeatId, cards: readonly CardId[]): void {
  cards.forEach((card, index) => {
    ctx.fx.emit(Fx.DealCard, { card, from: `seat:${from}`, to: `hand:${to}`, dur: 200 }, index * 60);
  });
  ctx.fx.emit(PresidentFx.Exchange, { fromSeat: from, toSeat: to, count: cards.length });
}

const giveCards: Move<PresidentState> = {
  validate(state, seat, payload) {
    if (!state.lastOrder) return error('no-roles', 'no roles exist yet');
    if (!state.awaitingGive.includes(seat)) return error('not-giving', 'this seat owes no gift');
    const cards = payloadCardList(payload);
    if (!cards) return error('bad-payload', 'expected {cards: string[]}');
    const role = roleFor(state.lastOrder, seat);
    const expected = giftCountFor(role ?? 'neutral');
    if (cards.length !== expected) {
      return error('wrong-count', `this seat gives ${expected} card(s)`);
    }
    if (!heldOnce(handOf(state, seat), cards)) {
      return error('not-in-hand', 'gifts must come from the giver’s own hand');
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const cards = payloadCardList(payload)!;
    const order = state.lastOrder!;
    const recipient = counterpartOf(order, seat)!;
    exchangeFlight(ctx, seat, recipient, cards);
    let next: PresidentState = {
      ...state,
      hands: addToHand(removeFromHand(state.hands, seat, cards), recipient, cards),
      exchangeLog: [...state.exchangeLog, { from: seat, to: recipient, cards }],
      awaitingGive: state.awaitingGive.filter((giver) => giver !== seat),
    };
    if (next.awaitingGive.length === 0) {
      next = { ...next, awaitingReturn: { seat: order[0]!, count: 2 } };
      ctx.fx.emit(Fx.TurnRing, { seat: order[0]! }, 60);
    }
    return next;
  },
};

const returnCards: Move<PresidentState> = {
  validate(state, seat, payload) {
    if (state.awaitingReturn?.seat !== seat) {
      return error('not-returning', 'this seat owes no return');
    }
    const cards = payloadCardList(payload);
    if (!cards) return error('bad-payload', 'expected {cards: string[]}');
    if (cards.length !== state.awaitingReturn.count) {
      return error('wrong-count', `this seat returns ${state.awaitingReturn.count} card(s)`);
    }
    if (!heldOnce(handOf(state, seat), cards)) {
      return error('not-in-hand', 'returns must come from the returner’s own hand');
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const cards = payloadCardList(payload)!;
    const order = state.lastOrder!;
    const recipient = counterpartOf(order, seat)!;
    exchangeFlight(ctx, seat, recipient, cards);
    let next: PresidentState = {
      ...state,
      hands: addToHand(removeFromHand(state.hands, seat, cards), recipient, cards),
      exchangeLog: [...state.exchangeLog, { from: seat, to: recipient, cards }],
    };
    const returningVice = seat === order[1];
    next = returningVice
      ? { ...next, awaitingReturn: null }
      : { ...next, awaitingReturn: order[1] !== undefined ? { seat: order[1]!, count: 1 } : null };
    if (next.awaitingReturn === null) {
      next = { ...next, turn: order[0]! };
      ctx.fx.emit(Fx.TurnRing, { seat: order[0]! }, 60);
    }
    return next;
  },
};

/** Automatic-only: opens the next deal once every seat has finished. */
const openNextDeal: Move<PresidentState> = {
  validate(state) {
    return state.finished.length >= state.seats
      ? true
      : error('deal-not-finished', 'the current deal is still live');
  },
  apply(state, _seat, _payload, ctx) {
    return openDeal(state, ctx);
  },
};

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function legalMovesForSeat(
  state: PresidentState,
  phase: PhaseState,
  seat: SeatId,
): readonly LegalMove[] {
  switch (phase.phase) {
    case 'play': {
      if (state.turn !== seat) return [];
      const sets = enumerableSets(state, seat).map((set) => ({
        id: 'playSet',
        payload: { cards: set.cards },
        hint: `${set.size} × rank ${set.rank}`,
      }));
      return state.standing ? [...sets, { id: 'pass' }] : sets;
    }
    case 'exchange-give':
      return (phase.actors ?? []).includes(seat) ? [{ id: 'giveCards' }] : [];
    case 'exchange-return':
      return phase.actor === seat ? [{ id: 'returnCards' }] : [];
    default:
      return [];
  }
}

const flow: Flow<PresidentState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMovesFor: legalMovesForSeat,
  legalMoves(state, phase) {
    const actors =
      phase.actors && phase.actors.length > 0
        ? phase.actors
        : phase.actor !== null
          ? [phase.actor]
          : [];
    return actors.flatMap((seat) => legalMovesForSeat(state, phase, seat));
  },
  advance(state) {
    if (matchOver(state)) {
      return { phase: phaseFor(state), ended: matchResult(state) };
    }
    if (state.finished.length >= state.seats) {
      return {
        phase: {
          phase: 'deal-open',
          actor: null,
          round: state.deal + 2,
          label: 'dealing next',
        },
        autoMoves: [{ seat: null, move: 'openNextDeal', reason: 'deal-complete' }],
      };
    }
    return { phase: phaseFor(state) };
  },
};

// ---------------------------------------------------------------------------
// Setup & definition
// ---------------------------------------------------------------------------

function initialState(seats: number, rules: PresidentRules): PresidentState {
  return {
    seats,
    rules,
    score: Array.from({ length: seats }, () => 0),
    deal: -1,
    hands: Array.from({ length: seats }, () => [] as CardId[]),
    ...freshTrick(),
    captured: [],
    finished: [],
    lastOrder: null,
    awaitingGive: [],
    awaitingReturn: null,
    exchangeLog: [],
    turn: null,
  };
}

function setup(ctx: SetupCtx<PresidentRules>): PresidentState {
  const { config, seats } = ctx;
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
    throw new Error(`president requires ${MIN_SEATS}–${MAX_SEATS} seats`);
  }
  // openDeal reads only rng/fx/deckOrder from the setup context.
  return openDeal(initialState(seats, config), {
    rng: ctx.rng,
    fx: ctx.fx,
    event: { seq: -1 },
    deckOrder: ctx.deckOrder,
  });
}

export function createPresidentDef(options: { bots?: readonly BotPolicy<PresidentState>[] } = {}): GameDef<
  PresidentState,
  PresidentRules
> {
  return {
    id: GAME_ID,
    howToPlay: presidentHowToPlay,
    configSchema: presidentConfig,
    veil: veilSupport({ deck: PRESIDENT_DECK, publicSetup: 'none' }),
    setup,
    moves: { playSet, pass, giveCards, returnCards, openNextDeal },
    flow,
    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
      };
    },
    end(state) {
      return matchOver(state) ? matchResult(state) : null;
    },
    bots: options.bots ?? presidentBots,
  };
}

export const presidentGame = createPresidentDef();



