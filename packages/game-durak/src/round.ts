import {
  Fx,
  addToBottom,
  drawFrom,
  shuffledIds,
  type CardId,
  type FxEmitter,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import {
  beats,
  durakDeck,
  hasHiddenCard,
  isHiddenCard,
  rankOf,
  suitOf,
  type DurakSuit,
} from './cards';
import type { DurakRules } from './config';
import type { DurakOutcome, DurakState, DurakTablePair } from './state';

export const DURAK_MIN_SEATS = 2;
export const DURAK_MAX_SEATS = 6;

/** Namespaced fx this pack emits, alongside the shared `card.fly` / `turn.ring` kinds. */
export const DurakFx = {
  Attack: 'durak.attack',
  ThrowIn: 'durak.throwIn',
  Beat: 'durak.beat',
  Pickup: 'durak.pickup',
  Transfer: 'durak.transfer',
  Refill: 'durak.refill',
  Out: 'durak.out',
} as const;

const REFILL_STEP_MS = 90;

export interface DurakDealCtx {
  config: DurakRules;
  seats: number;
  rng: Rng;
  fx: FxEmitter;
  /** Ceremony deck order for veiled rooms; see `SetupCtx.deckOrder`. */
  deckOrder?: readonly CardId[];
}

// ---------------------------------------------------------------------------
// seat helpers
// ---------------------------------------------------------------------------

export function isSeatIn(state: DurakState, seat: SeatId): boolean {
  return !state.out.includes(seat);
}

/** The first seat at or after `start` that is not in `out` (wrapping the ring once). */
function activeSeatFrom(seats: number, start: SeatId, out: readonly SeatId[]): SeatId {
  for (let step = 0; step < seats; step++) {
    const seat = ((start + step) % seats) as SeatId;
    if (!out.includes(seat)) return seat;
  }
  throw new Error('durak: no active seat left');
}

function activeSeatAfter(seats: number, from: SeatId, out: readonly SeatId[]): SeatId {
  return activeSeatFrom(seats, ((from + 1) % seats) as SeatId, out);
}

/** The next seat clockwise still holding cards (or still owed a hand). */
export function nextActiveSeat(state: DurakState, from: SeatId): SeatId {
  return activeSeatAfter(state.seats, from, state.out);
}

/**
 * Seats eligible to throw a card into this bout: the primary attacker first,
 * then every other seat still in the hand, clockwise, defender excluded.
 */
export function attackOrder(
  seats: number,
  attacker: SeatId,
  defender: SeatId,
  out: readonly SeatId[] = [],
): SeatId[] {
  const order: SeatId[] = [];
  for (let step = 0; step < seats; step++) {
    const seat = ((attacker + step) % seats) as SeatId;
    if (seat === defender) continue;
    if (out.includes(seat)) continue;
    order.push(seat);
  }
  return order;
}

export function handOf(state: DurakState, seat: SeatId): readonly CardId[] {
  return state.hands[seat] ?? [];
}

// ---------------------------------------------------------------------------
// bout-state queries
// ---------------------------------------------------------------------------

export function pendingPairs(state: DurakState): readonly DurakTablePair[] {
  return state.table.filter((pair) => pair.defend === null);
}

export function hasPending(state: DurakState): boolean {
  return state.table.some((pair) => pair.defend === null);
}

/** Every rank currently showing on the table, attacking or beaten. */
function tableRanks(state: DurakState): Set<number> {
  const ranks = new Set<number>();
  for (const pair of state.table) {
    ranks.add(rankOf(pair.attack));
    if (pair.defend) ranks.add(rankOf(pair.defend));
  }
  return ranks;
}

export function canAttack(state: DurakState, seat: SeatId, card: CardId): boolean {
  if (isHiddenCard(card)) return false;
  if (hasPending(state)) return false;
  if (!handOf(state, seat).includes(card)) return false;
  if (state.table.length >= state.attackCap) return false;
  if (state.table.length === 0) return seat === state.attacker;
  if (!state.attackers.includes(seat) || state.passed.includes(seat)) return false;
  if (!state.rules.throwIns) return false;
  return tableRanks(state).has(rankOf(card));
}

export function canDefend(state: DurakState, attack: CardId, card: CardId): boolean {
  if (isHiddenCard(card)) return false;
  if (!handOf(state, state.defender).includes(card)) return false;
  const pair = state.table.find((entry) => entry.attack === attack && entry.defend === null);
  if (!pair) return false;
  return beats(pair.attack, card, state.trumpSuit);
}

export function canTransfer(state: DurakState, card: CardId): boolean {
  if (!state.rules.transfer) return false;
  if (isHiddenCard(card)) return false;
  if (state.table.length === 0) return false;
  // Perevodnoy only works before the defender has beaten anything this bout.
  if (state.table.some((pair) => pair.defend !== null)) return false;
  if (!handOf(state, state.defender).includes(card)) return false;
  const rank = rankOf(state.table[0]!.attack);
  if (rankOf(card) !== rank) return false;
  let nextDefender: SeatId;
  try {
    nextDefender = nextActiveSeat(state, state.defender);
  } catch {
    return false;
  }
  if (nextDefender === state.attacker) {
    // A seat cannot be both the bout's primary attacker and its defender —
    // with only one other seat left, a transfer has nowhere real to land.
    return false;
  }
  return handOf(state, nextDefender).length >= state.table.length + 1;
}

export function canTakeCards(state: DurakState): boolean {
  return hasPending(state);
}

export function canPass(state: DurakState, seat: SeatId): boolean {
  if (hasPending(state)) return false;
  if (state.table.length === 0) return false;
  if (!state.attackers.includes(seat) || state.passed.includes(seat)) return false;
  return true;
}

/** Seats still able to act in the current attack window, primary actor first. */
export function attackActors(state: DurakState): readonly SeatId[] {
  if (state.table.length === 0) return [state.attacker];
  return state.attackers.filter((seat) => !state.passed.includes(seat));
}

/** True once nothing more can be thrown in and every attack has been beaten. */
export function boutBeaten(state: DurakState): boolean {
  if (state.table.length === 0) return false;
  if (hasPending(state)) return false;
  return state.attackers.every((seat) => state.passed.includes(seat));
}

// ---------------------------------------------------------------------------
// dealing
// ---------------------------------------------------------------------------

function removeCard(hand: readonly CardId[], card: CardId): CardId[] {
  const at = hand.indexOf(card);
  if (at < 0) return hand.slice();
  return [...hand.slice(0, at), ...hand.slice(at + 1)];
}

function lowestTrumpSeat(hands: readonly CardId[][], trumpSuit: DurakSuit): SeatId | null {
  let best: SeatId | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (let seat = 0; seat < hands.length; seat++) {
    for (const card of hands[seat] ?? []) {
      if (isHiddenCard(card)) continue;
      if (suitOf(card) !== trumpSuit) continue;
      const rank = rankOf(card);
      if (rank < bestRank) {
        bestRank = rank;
        best = seat as SeatId;
      }
    }
  }
  return best;
}

/**
 * The hand size a deal can actually afford. A 36-card pack cannot deal six
 * seats six cards each and still leave one behind for the trump — 6×6 is the
 * whole deck — so a full table deals one card thinner instead of refusing to
 * seat six players at all. Every seat still tops back up toward `refillTo` as
 * the hand goes on and cards free up; only the opening deal is affected.
 */
export function effectiveHandSize(seats: number, refillTo: number): number {
  const maxFit = Math.floor((durakDeck.cardIds.length - 1) / seats);
  return Math.max(1, Math.min(refillTo, maxFit));
}

export function dealDurak(ctx: DurakDealCtx): DurakState {
  const { config, seats, fx } = ctx;
  if (!Number.isInteger(seats) || seats < DURAK_MIN_SEATS || seats > DURAK_MAX_SEATS) {
    throw new Error(`durak requires ${DURAK_MIN_SEATS}–${DURAK_MAX_SEATS} seats`);
  }
  const handSize = effectiveHandSize(seats, config.refillTo);

  const order = ctx.deckOrder ? [...ctx.deckOrder] : shuffledIds(durakDeck, ctx.rng);
  const hands: CardId[][] = Array.from({ length: seats }, () => []);
  let cursor = 0;
  for (let round = 0; round < handSize; round++) {
    for (let seat = 0; seat < seats; seat++) {
      const card = order[cursor++];
      if (!card) throw new Error('durak deck exhausted during the deal');
      hands[seat]?.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * 60,
      );
    }
  }

  const trumpCard = order[cursor++];
  if (!trumpCard) throw new Error('durak deck has no card left to set the trump');
  fx.emit(Fx.FlipCard, { card: trumpCard, to: 'stock' }, cursor * 60);
  const trumpSuit = suitOf(trumpCard);

  const rest = order.slice(cursor);
  const stock = addToBottom(rest, trumpCard);

  const attacker = lowestTrumpSeat(hands, trumpSuit) ?? 0;
  const defender = ((attacker + 1) % seats) as SeatId;
  const attackers = attackOrder(seats, attacker, defender);
  const attackCap = Math.min(config.maxAttacks, hands[defender]?.length ?? handSize);

  return {
    seats,
    rules: config,
    veiled: false,
    hands,
    stock,
    trumpCard,
    trumpSuit,
    table: [],
    attacker,
    defender,
    attackers,
    passed: [],
    attackCap,
    boutIndex: 0,
    out: [],
    outcome: null,
  };
}

// ---------------------------------------------------------------------------
// moves
// ---------------------------------------------------------------------------

export function applyAttack(
  state: DurakState,
  seat: SeatId,
  card: CardId,
  fx: FxEmitter,
): DurakState {
  const wasEmpty = state.table.length === 0;
  const hands = state.hands.map((cards, index) =>
    index === seat ? removeCard(cards, card) : cards,
  );
  const table = [...state.table, { attack: card, defend: null }];
  fx.emit(Fx.DiscardCard, { card, seat, to: 'table' });
  fx.emit(wasEmpty ? DurakFx.Attack : DurakFx.ThrowIn, { seat, card });
  return { ...state, hands, table };
}

export function applyDefend(
  state: DurakState,
  attack: CardId,
  card: CardId,
  fx: FxEmitter,
): DurakState {
  const hands = state.hands.map((cards, index) =>
    index === state.defender ? removeCard(cards, card) : cards,
  );
  const table = state.table.map((pair) =>
    pair.attack === attack ? { ...pair, defend: card } : pair,
  );
  fx.emit(Fx.DiscardCard, { card, seat: state.defender, to: 'table' });
  fx.emit(DurakFx.Beat, { seat: state.defender, attack, card });
  return { ...state, hands, table };
}

export function applyTransfer(state: DurakState, card: CardId, fx: FxEmitter): DurakState {
  const oldDefender = state.defender;
  const newDefender = nextActiveSeat(state, oldDefender);
  const hands = state.hands.map((cards, index) =>
    index === oldDefender ? removeCard(cards, card) : cards,
  );
  const table = [...state.table, { attack: card, defend: null }];
  fx.emit(Fx.DiscardCard, { card, seat: oldDefender, to: 'table' });
  fx.emit(DurakFx.Transfer, { seat: oldDefender, card, to: newDefender });
  const attackers = attackOrder(state.seats, state.attacker, newDefender, state.out);
  const attackCap = Math.min(state.rules.maxAttacks, hands[newDefender]?.length ?? 0);
  return { ...state, hands, table, defender: newDefender, attackers, attackCap };
}

export function applyPass(state: DurakState, seat: SeatId): DurakState {
  return { ...state, passed: [...state.passed, seat] };
}

/**
 * Ends the current bout, one way or the other, and opens the next one:
 * refills every hand in the prescribed order, works out who is out for good,
 * and — when only one seat is left holding cards — settles the match.
 */
export function resolveBout(state: DurakState, taken: boolean, fx: FxEmitter): DurakState {
  const failedDefender = state.defender;
  let hands = state.hands;
  if (taken) {
    const swept = state.table.flatMap((pair) =>
      pair.defend ? [pair.attack, pair.defend] : [pair.attack],
    );
    hands = state.hands.map((cards, index) =>
      index === failedDefender ? [...cards, ...swept] : cards,
    );
    swept.forEach((card, index) =>
      fx.emit(Fx.DrawCard, { card, seat: failedDefender, from: 'table' }, index * REFILL_STEP_MS),
    );
    fx.emit(DurakFx.Pickup, { seat: failedDefender, cards: swept.length });
  }

  const newAttacker = taken ? nextActiveSeat(state, failedDefender) : failedDefender;
  const newDefender = nextActiveSeat(state, newAttacker);
  const refillOrder = [
    ...attackOrder(state.seats, newAttacker, newDefender, state.out),
    newDefender,
  ];

  let stock = state.stock;
  let refillCursor = 0;
  for (const seat of refillOrder) {
    const need = Math.max(0, state.rules.refillTo - (hands[seat]?.length ?? 0));
    if (need === 0) continue;
    const take = drawFrom(stock, need);
    if (take.drawn.length === 0) continue;
    stock = take.rest;
    take.drawn.forEach((card) => {
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 200 },
        refillCursor * REFILL_STEP_MS,
      );
      refillCursor += 1;
    });
    fx.emit(
      DurakFx.Refill,
      { seat, count: take.drawn.length },
      (refillCursor - 1) * REFILL_STEP_MS,
    );
    hands = hands.map((cards, index) => (index === seat ? [...cards, ...take.drawn] : cards));
  }

  let out = state.out;
  if (stock.length === 0) {
    for (let seat = 0; seat < state.seats; seat++) {
      if (out.includes(seat) || (hands[seat]?.length ?? 0) > 0) continue;
      out = [...out, seat as SeatId];
      fx.emit(DurakFx.Out, { seat });
    }
  }

  const activeSeats = Array.from({ length: state.seats }, (_v, seat) => seat as SeatId).filter(
    (seat) => !out.includes(seat),
  );
  const outcome = matchOutcomeFor(state.seats, out, activeSeats);

  if (outcome) {
    return {
      ...state,
      hands,
      stock,
      table: [],
      attacker: newAttacker,
      defender: newDefender,
      attackers: [],
      passed: [],
      attackCap: 0,
      boutIndex: state.boutIndex + 1,
      out,
      outcome,
    };
  }

  // The provisional attacker/defender were chosen before refilling could tell
  // anyone had actually run out of cards. If one of them just emptied out
  // (stock ran dry mid-refill), the seat that would have attacked next has
  // already left the game — attack passes to whoever is still in.
  const finalAttacker = activeSeatFrom(state.seats, newAttacker, out);
  const finalDefender = activeSeatAfter(state.seats, finalAttacker, out);
  const attackers = attackOrder(state.seats, finalAttacker, finalDefender, out);
  const attackCap = Math.min(
    state.rules.maxAttacks,
    hands[finalDefender]?.length ?? state.rules.refillTo,
  );
  return {
    ...state,
    hands,
    stock,
    table: [],
    attacker: finalAttacker,
    defender: finalDefender,
    attackers,
    passed: [],
    attackCap,
    boutIndex: state.boutIndex + 1,
    out,
    outcome: null,
  };
}

function matchOutcomeFor(
  seats: number,
  out: readonly SeatId[],
  active: readonly SeatId[],
): DurakOutcome | null {
  if (active.length >= 2) return null;
  if (active.length === 1) return { loser: active[0]!, order: out };
  // Everybody emptied their hand in the same exchange: no fool this hand.
  if (active.length === 0 && out.length === seats) return { loser: null, order: out };
  return null;
}

/**
 * The heads-up house rule: the first hand to empty wins outright, stock or
 * not. Only meaningful two-handed — see `DurakRules.instantWin`.
 */
export function instantWinOutcome(state: DurakState): DurakOutcome | null {
  if (!state.rules.instantWin || state.seats !== 2 || state.outcome) return null;
  for (let seat = 0; seat < 2; seat++) {
    if ((state.hands[seat]?.length ?? 0) === 0 && !hasHiddenCard(state.hands[seat] ?? [])) {
      const other = ((seat + 1) % 2) as SeatId;
      return { loser: other, order: [seat as SeatId] };
    }
  }
  return null;
}
