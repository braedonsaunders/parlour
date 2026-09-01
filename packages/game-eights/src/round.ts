import {
  advanceSeat,
  Fx,
  addTo,
  drawFrom,
  recycleSpentPile,
  shuffledIds,
  type CardId,
  type CardRecycle,
  type FxEmitter,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import {
  DRAW_TWO_RANK,
  REVERSE_RANK,
  SKIP_RANK,
  WILD_RANK,
  eightsDeck,
  handValue,
  hasHiddenCard,
  isHiddenCard,
  rankOf,
  suitOf,
  type EightsSuit,
} from './cards';
import type { EightsRules } from './config';
import type { EightsRound } from './state';

export const EIGHTS_MIN_SEATS = 2;
export const EIGHTS_MAX_SEATS = 6;

/** Presentation offset so a forced pickup lands after the card that caused it. */
export const FORCED_DRAW_DELAY_MS = 300;

/** Longest window a pickup may occupy; a stacked +8 compresses rather than stalls. */
const PICKUP_SPAN_MAX_MS = 1_000;
const PICKUP_STEP_MS = 150;

const DEAL_STEP_MS = 70;

export interface EightsDealCtx {
  config: EightsRules;
  seats: number;
  rng: Rng;
  fx: FxEmitter;
  /**
   * The order to deal from, when the room has one.
   *
   * A veiled deal comes out of a shuffle ceremony rather than the session rng,
   * because an rng order is replayable by every seat and would make the whole
   * deck readable. When this is absent the deal shuffles for itself, which is
   * what an open room and every solo table do.
   */
  deckOrder?: readonly CardId[];
}

export function topCard(round: EightsRound): CardId {
  const card = round.discard[0];
  if (!card) throw new Error('the eights discard cannot be empty');
  return card;
}

export function handOf(round: EightsRound, seat: SeatId): readonly CardId[] {
  return round.hands[seat] ?? [];
}

export function nextSeat(round: EightsRound, from: SeatId, steps = 1): SeatId {
  return advanceSeat(from, round.hands.length, steps, round.direction);
}

/** A two can only be answered by another two, and only when the table stacks. */
export function canStack(round: EightsRound, rules: EightsRules, card: CardId): boolean {
  if (round.pendingDraw <= 0) return false;
  return rules.stackDrawTwo && rules.twosDrawTwo && rankOf(card) === DRAW_TWO_RANK;
}

/**
 * Match the suit the pile is asking for, or the rank on top of it. Eights are
 * wild and go on anything — except an unanswered two, which wants a two.
 */
export function canPlay(round: EightsRound, rules: EightsRules, card: CardId): boolean {
  // A card nobody can read plays on nothing. Every caller that wants the
  // benefit of the doubt for a closed hand — the blocked check — asks for it
  // explicitly; everywhere else a handle is simply not a legal play.
  if (isHiddenCard(card)) return false;
  if (round.pendingDraw > 0) return canStack(round, rules, card);
  if (rankOf(card) === WILD_RANK) return true;
  if (suitOf(card) === round.activeSuit) return true;
  return rankOf(card) === rankOf(topCard(round));
}

export function playableCards(
  round: EightsRound,
  rules: EightsRules,
  seat: SeatId,
): readonly CardId[] {
  return handOf(round, seat).filter((card) => canPlay(round, rules, card));
}

export function hasPlayable(round: EightsRound, rules: EightsRules, seat: SeatId): boolean {
  // A hand the table cannot read might hold a play, so it is never counted as
  // stuck — a veiled round blocks only when every open hand is out of options.
  return handOf(round, seat).some((card) => isHiddenCard(card) || canPlay(round, rules, card));
}

/** No stock and nothing but the face-up card in the discard: the pile is spent. */
export function stockDry(round: EightsRound): boolean {
  return round.stock.length === 0 && round.discard.length <= 1;
}

export function canDraw(round: EightsRound): boolean {
  return !stockDry(round);
}

// ---------------------------------------------------------------------------
// dealing
// ---------------------------------------------------------------------------

/**
 * One deal, from the seat left of the dealer.
 *
 * The starter is the first card off the stock that is not an eight — turning a
 * wild face up would ask the pile a question nobody has been given the chance
 * to answer. When the remaining stock is nothing but eights (possible, barely,
 * at a full table) the first card starts the pile and simply asks for its own
 * suit.
 */
export function dealRound(ctx: EightsDealCtx, dealer: SeatId): EightsRound {
  const { config, seats, fx } = ctx;
  if (!Number.isInteger(seats) || seats < EIGHTS_MIN_SEATS || seats > EIGHTS_MAX_SEATS) {
    throw new Error(`eights requires ${EIGHTS_MIN_SEATS}–${EIGHTS_MAX_SEATS} seats`);
  }
  if (seats * config.handSize + 1 > eightsDeck.cardIds.length) {
    throw new Error(`eights cannot deal ${config.handSize} cards to ${seats} seats from one pack`);
  }

  const shuffled = ctx.deckOrder ? [...ctx.deckOrder] : shuffledIds(eightsDeck, ctx.rng);
  const hands: CardId[][] = Array.from({ length: seats }, () => []);
  let cursor = 0;
  for (let round = 0; round < config.handSize; round++) {
    for (let step = 0; step < seats; step++) {
      const seat = (dealer + 1 + step) % seats;
      const card = shuffled[cursor++];
      if (!card) throw new Error('eights deck exhausted during the deal');
      hands[seat]?.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STEP_MS,
      );
    }
  }

  const rest = shuffled.slice(cursor);
  // Under Veil the room opens starter candidates in public before the deal, so
  // the readable cards sit at the front of what is left; a handle is skipped
  // rather than asked for its rank, which would throw.
  const starterIndex = Math.max(
    0,
    rest.findIndex((card) => !isHiddenCard(card) && rankOf(card) !== WILD_RANK),
  );
  const starter = rest[starterIndex];
  if (!starter) throw new Error('eights deck has no card left to start the pile');
  const stock = [...rest.slice(0, starterIndex), ...rest.slice(starterIndex + 1)];
  fx.emit(Fx.FlipCard, { card: starter, to: 'discard' }, cursor * DEAL_STEP_MS);

  return {
    hands,
    stock,
    discard: [starter],
    turn: (dealer + 1) % seats,
    direction: 1,
    activeSuit: suitOf(starter),
    pendingDraw: 0,
    awaitingSuit: null,
    drawnCard: null,
    outcome: null,
  };
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

/** Why a seat is picking up, for the table's running pickup readout. */
export type EightsPickupReason = 'penalty' | 'voluntary';

export interface EightsDrawOptions {
  delayMs?: number;
  /** Ends the draw as soon as a taken card satisfies it (draw-until-playable). */
  stopWhen?: (card: CardId) => boolean;
  /** Announces the pickup as a single countable event. */
  announce?: EightsPickupReason;
  /** The re-veiled exchange a veiled round hands the first replenish. */
  recycle?: CardRecycle;
}

/** Turns the spent discard back into a stock, keeping the face-up card in place. */
export function replenish(
  round: EightsRound,
  fx: FxEmitter,
  rng: Rng,
  recycle?: CardRecycle,
): EightsRound {
  if (round.stock.length > 0 || round.discard.length <= 1) return round;
  // A re-veiled exchange swaps exactly the cards its ceremony covered; cards
  // played after the cut stay face up for the next recycle to sweep.
  if (recycle) {
    const swapped = recycleSpentPile(round.stock, round.discard, recycle);
    if (swapped) {
      fx.emit(Fx.ShuffleStock, {});
      return { ...round, ...swapped };
    }
  }
  const [top, ...recyclable] = round.discard;
  // Every card in a spent discard is face up. Shuffling those into a stock with
  // the session rng makes the rest of the deal readable by the whole table, so
  // a veiled room re-veils them in a fresh epoch first and hands the recycled
  // handles back through the move; the guard on `draw` is what stops the round
  // arriving here before that has happened.
  if (hasHiddenCard(round.hands.flat()) && recyclable.some((card) => !isHiddenCard(card))) {
    return round;
  }
  fx.emit(Fx.ShuffleStock, {});
  return { ...round, stock: rng.shuffle(recyclable), discard: top ? [top] : [] };
}

export function drawCards(
  round: EightsRound,
  seat: SeatId,
  count: number,
  fx: FxEmitter,
  rng: Rng,
  options: EightsDrawOptions = {},
): EightsRound {
  const delayMs = options.delayMs ?? 0;
  let next = round;
  const drawn: CardId[] = [];
  while (drawn.length < count) {
    next = replenish(next, fx, rng, options.recycle);
    if (next.stock.length === 0) break;
    const take = drawFrom(next.stock, 1);
    const card = take.drawn[0];
    if (!card) break;
    drawn.push(card);
    next = { ...next, stock: take.rest };
    if (options.stopWhen?.(card)) break;
  }

  const gaps = Math.max(1, drawn.length - 1);
  const step = Math.min(PICKUP_STEP_MS, PICKUP_SPAN_MAX_MS / gaps);
  if (options.announce && drawn.length > 0) {
    fx.emit(
      'eights.pickup',
      { seat, amount: drawn.length, reason: options.announce, stepMs: step },
      delayMs,
    );
  }
  drawn.forEach((card, index) =>
    fx.emit(Fx.DrawCard, { card, seat, from: 'stock' }, delayMs + index * step),
  );

  return {
    ...next,
    hands: next.hands.map((cards, index) => (index === seat ? [...cards, ...drawn] : cards)),
  };
}

// ---------------------------------------------------------------------------
// playing
// ---------------------------------------------------------------------------

/**
 * Puts a card on the pile and moves the turn along.
 *
 * An eight stops here: the seat keeps the turn until it names a suit. Every
 * other card resolves its effect, hands the turn on, and — if the hand emptied
 * — closes the round.
 */
export function playCardInRound(
  round: EightsRound,
  rules: EightsRules,
  seat: SeatId,
  card: CardId,
  fx: FxEmitter,
): EightsRound {
  const rank = rankOf(card);
  const hands = round.hands.map((cards, index) =>
    index === seat ? cards.filter((held) => held !== card) : cards.slice(),
  );
  fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });

  const played: EightsRound = {
    ...round,
    hands,
    discard: addTo(round.discard, card),
    drawnCard: null,
  };
  const emptied = (hands[seat]?.length ?? 0) === 0;

  if (rank === WILD_RANK) {
    fx.emit('eights.wild', { card, seat });
    // A hand already emptied has won; nobody needs the suit it would have named.
    if (emptied) return { ...played, awaitingSuit: null };
    return { ...played, awaitingSuit: seat, turn: seat };
  }

  let next: EightsRound = { ...played, activeSuit: suitOf(card) };
  let steps = 1;

  if (rank === DRAW_TWO_RANK && rules.twosDrawTwo) {
    next = { ...next, pendingDraw: next.pendingDraw + 2 };
    fx.emit('eights.draw-stack', { seat, amount: next.pendingDraw });
  } else if (rank === SKIP_RANK && rules.queensSkip) {
    steps = 2;
    fx.emit('eights.skip', { seat: nextSeat(next, seat) });
  } else if (rank === REVERSE_RANK && rules.acesReverse) {
    next = { ...next, direction: next.direction === 1 ? -1 : 1 };
    // Head-to-head there is no ring to turn around, so a reverse lands as a skip.
    steps = next.hands.length === 2 ? 2 : 1;
    fx.emit('eights.reverse', { direction: next.direction, seat });
  }

  // A shed hand ends the round where it stands; `settleRound` closes it.
  if (emptied) return next;

  const turn = nextSeat(next, seat, steps);
  fx.emit(Fx.TurnRing, { seat: turn }, 80);
  return { ...next, turn };
}

/** Names the suit an eight is asking for and hands the turn on. */
export function chooseSuitInRound(
  round: EightsRound,
  seat: SeatId,
  suit: EightsSuit,
  fx: FxEmitter,
): EightsRound {
  fx.emit('eights.suit', { seat, suit });
  const named: EightsRound = { ...round, activeSuit: suit, awaitingSuit: null };
  const turn = nextSeat(named, seat);
  fx.emit(Fx.TurnRing, { seat: turn }, 80);
  return { ...named, turn };
}

// ---------------------------------------------------------------------------
// closing a round
// ---------------------------------------------------------------------------

function valuesOf(round: EightsRound): number[] {
  return round.hands.map((cards) => handValue(cards));
}

function finishShed(round: EightsRound, seat: SeatId, fx: FxEmitter): EightsRound {
  const handValues = valuesOf(round);
  const points = handValues.reduce(
    (total, value, index) => (index === seat ? total : total + value),
    0,
  );
  fx.emit('eights.out', { seat, points });
  return {
    ...round,
    pendingDraw: 0,
    outcome: {
      winner: seat,
      points,
      handValues,
      handCounts: round.hands.map((cards) => cards.length),
      reason: 'shed',
    },
  };
}

/**
 * The lightest hand at a dead table.
 *
 * Ties go to the seat holding fewer cards, then to the lower seat id — a stated
 * rule beats a coin flip nobody can replay.
 */
function lightestSeat(round: EightsRound, handValues: readonly number[]): SeatId {
  let best = 0;
  for (let seat = 1; seat < round.hands.length; seat++) {
    const value = handValues[seat] ?? 0;
    const bestValue = handValues[best] ?? 0;
    if (value < bestValue) {
      best = seat;
      continue;
    }
    if (
      value === bestValue &&
      (round.hands[seat]?.length ?? 0) < (round.hands[best]?.length ?? 0)
    ) {
      best = seat;
    }
  }
  return best;
}

/**
 * A blocked round still pays: the lightest hand banks what the others are
 * carrying, less its own. Sitting on an unplayable eight is meant to hurt.
 */
function finishBlocked(round: EightsRound, fx: FxEmitter): EightsRound {
  const handValues = valuesOf(round);
  const winner = lightestSeat(round, handValues);
  const others = handValues.reduce(
    (total, value, index) => (index === winner ? total : total + value),
    0,
  );
  const points = Math.max(0, others - (handValues[winner] ?? 0));
  fx.emit('eights.blocked', { seat: winner, points });
  return {
    ...round,
    pendingDraw: 0,
    outcome: {
      winner,
      points,
      handValues,
      handCounts: round.hands.map((cards) => cards.length),
      reason: 'blocked',
    },
  };
}

/**
 * Closes a round the moment it is actually over.
 *
 * A dry stock where no seat holds a playable card cannot recover: the pile
 * never changes again, so the table would only pass forever. Detecting it here
 * ends the round on the move that caused it rather than after a silent lap.
 */
/**
 * Whether the round is over but for the arithmetic.
 *
 * Separate from settling because a veiled round reaches this point with hands
 * nobody can score yet: everyone still holding cards has to open them first,
 * and the flow drives that from here.
 */
export function roundIsOver(round: EightsRound, rules: EightsRules): boolean {
  if (round.awaitingSuit !== null || round.drawnCard !== null) return false;
  if (round.hands.some((cards) => cards.length === 0)) return true;
  if (!stockDry(round)) return false;
  return round.hands.every((_cards, seat) => !hasPlayable(round, rules, seat));
}

export function settleRound(round: EightsRound, rules: EightsRules, fx: FxEmitter): EightsRound {
  if (round.outcome) return round;
  if (!roundIsOver(round, rules)) return round;
  // Scoring adds up what every seat is still holding, which a closed hand
  // cannot answer. A veiled round stays open here until the reveal phase has
  // walked round the table; settling on handles would score them all at zero.
  if (hasHiddenCard(round.hands.flat())) return round;
  const shedder = round.hands.findIndex((cards) => cards.length === 0);
  if (shedder >= 0) return finishShed(round, shedder, fx);
  return finishBlocked(round, fx);
}

/** Exposed for the round-end readout; the outcome carries the same numbers. */
export function roundHandValues(round: EightsRound): readonly number[] {
  return round.outcome?.handValues ?? valuesOf(round);
}
