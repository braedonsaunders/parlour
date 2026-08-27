import { Fx, dealOrder, type CardId, type FxEmitter, type Rng, type SeatId } from '@parlour/engine';
import { BLIND_RANK, BURN_RANK, PALACE_DECK, RESET_RANK, orderOf, tryOrder } from './cards';
import type { PalaceRules } from './config';
import type { PalaceState, TopRun } from './state';

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

/** Face-down and face-up rows are always 3 cards, per the locked deal shape. */
export const DOWN_SIZE = 3;
export const UP_SIZE = 3;

/**
 * Hand cards dealt per seat.
 *
 * The locked ruleset deals 3 down + 3 up + 3 hand to every seat regardless of
 * table size, but 6 seats × 9 cards is 54 — two more than a 52-card pack holds.
 * The down and up rows are fixed at 3 (they are named furniture in the table
 * UI), so a 6-seat table deals 2 to the hand instead of 3; 2–5 seats deal the
 * full 3/3/3. Documented deviation — see the pack README / worker report.
 */
export function handSizeFor(seats: number): number {
  return seats >= 6 ? 2 : 3;
}

const DEAL_STEP_MS = 22;

export interface PalaceDealCtx {
  seats: number;
  rng: Rng;
  fx: FxEmitter;
  deckOrder?: readonly CardId[];
}

export interface DealtRound {
  hands: CardId[][];
  up: CardId[][];
  down: CardId[][];
}

/**
 * Deals one round: down cards first (private), then up cards (the public
 * setup under Veil), then hand cards (private). Round-robin per row so odd
 * tables carry no positional bias.
 */
export function dealRound(ctx: PalaceDealCtx): DealtRound {
  const { seats, fx } = ctx;
  const order = dealOrder({ rng: ctx.rng, deckOrder: ctx.deckOrder }, PALACE_DECK);
  const startSeat = ctx.rng.int(seats);
  const down: CardId[][] = Array.from({ length: seats }, () => []);
  const up: CardId[][] = Array.from({ length: seats }, () => []);
  const hands: CardId[][] = Array.from({ length: seats }, () => []);
  const handSize = handSizeFor(seats);
  let cursor = 0;
  let stagger = 0;

  const dealRow = (
    rows: CardId[][],
    count: number,
    zone: (seat: SeatId) => string,
    dur: number,
  ) => {
    for (let row = 0; row < count; row++) {
      for (let step = 0; step < seats; step++) {
        const seat = (startSeat + step) % seats;
        const card = order[cursor++]!;
        rows[seat]!.push(card);
        fx.emit(
          Fx.DealCard,
          { card, from: 'stock', to: zone(seat), dur },
          stagger++ * DEAL_STEP_MS,
        );
      }
    }
  };

  dealRow(down, DOWN_SIZE, (seat) => `down:${seat}`, 190);
  dealRow(up, UP_SIZE, (seat) => `up:${seat}`, 200);
  dealRow(hands, handSize, (seat) => `hand:${seat}`, 220);

  return { hands, up, down };
}

/**
 * How many real deck positions the public setup (the up row) needs, and where
 * it starts — right after the down row, which is always private.
 */
export function publicSetupFrom(seats: number): number {
  return seats * DOWN_SIZE;
}

export function publicSetupSize(seats: number): number {
  return seats * UP_SIZE;
}

// ---------------------------------------------------------------------------
// Zone accessors
// ---------------------------------------------------------------------------

export function handOf(state: PalaceState, seat: SeatId): readonly CardId[] {
  return state.hands[seat] ?? [];
}

export function upOf(state: PalaceState, seat: SeatId): readonly CardId[] {
  return state.up[seat] ?? [];
}

export function downOf(state: PalaceState, seat: SeatId): readonly CardId[] {
  return state.down[seat] ?? [];
}

export function cardCount(state: PalaceState, seat: SeatId): number {
  return handOf(state, seat).length + upOf(state, seat).length + downOf(state, seat).length;
}

export function allEmpty(state: PalaceState, seat: SeatId): boolean {
  return cardCount(state, seat) === 0;
}

export type PalaceLayer = 'hand' | 'up' | 'down';

/** The zone a seat must play from: hand until empty, then up, then down. */
export function activeLayer(state: PalaceState, seat: SeatId): PalaceLayer | null {
  if (handOf(state, seat).length > 0) return 'hand';
  if (upOf(state, seat).length > 0) return 'up';
  if (downOf(state, seat).length > 0) return 'down';
  return null;
}

export function nextSeat(state: PalaceState, from: SeatId): SeatId {
  return (from + 1) % state.seats;
}

// ---------------------------------------------------------------------------
// Pile / floor rules
// ---------------------------------------------------------------------------

export function isAlwaysPlayable(rules: PalaceRules, rank: number): boolean {
  return (
    (rank === RESET_RANK && rules.twosReset) ||
    (rank === BLIND_RANK && rules.eightsBlind) ||
    (rank === BURN_RANK && rules.tensBurn)
  );
}

/** Whether `rank` may land on a pile whose current floor is `floor`. */
export function isPlayable(rules: PalaceRules, floor: number | null, rank: number): boolean {
  if (isAlwaysPlayable(rules, rank)) return true;
  return floor === null || rank >= floor;
}

export function extendRun(prev: TopRun | null, rank: number, count: number): TopRun {
  return prev && prev.rank === rank ? { rank, count: prev.count + count } : { rank, count };
}

// ---------------------------------------------------------------------------
// Hand ops
// ---------------------------------------------------------------------------

export function heldOnce(zone: readonly CardId[], cards: readonly CardId[]): boolean {
  const seen = new Set<CardId>();
  const pool = [...zone];
  for (const card of cards) {
    if (seen.has(card)) return false;
    const index = pool.indexOf(card);
    if (index < 0) return false;
    pool.splice(index, 1);
    seen.add(card);
  }
  return true;
}

export function removeFrom(
  rows: readonly (readonly CardId[])[],
  seat: SeatId,
  cards: readonly CardId[],
): CardId[][] {
  return rows.map((row, index) => {
    if (index !== seat) return [...row];
    const remaining = [...row];
    for (const card of cards) {
      const at = remaining.indexOf(card);
      if (at >= 0) remaining.splice(at, 1);
    }
    return remaining;
  });
}

export function addToHand(
  rows: readonly (readonly CardId[])[],
  seat: SeatId,
  cards: readonly CardId[],
): CardId[][] {
  return rows.map((row, index) => (index === seat ? [...row, ...cards] : [...row]));
}

// ---------------------------------------------------------------------------
// Starter selection
// ---------------------------------------------------------------------------

/**
 * The seat that opens play: whoever holds the lowest non-special card, ties
 * to the lowest seat id.
 *
 * Under Veil the engine's own state holds opaque handles for every hand — see
 * BUILD-SPEC §4.1, redaction is honest-UI, not cryptography, and the state
 * layer itself cannot compare hands it cannot read. Comparing "lowest across
 * every hand" needs every hand open, which defeats the point of dealing them
 * hidden, so a veiled table falls back to a seeded random opener instead of
 * the locked rule. Documented deviation — see the pack README / worker report.
 */
export function computeStarter(state: PalaceState, rng: Rng): SeatId {
  if (state.veiled) return rng.int(state.seats);
  let bestSeat: SeatId | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (let seat = 0; seat < state.seats; seat++) {
    for (const card of handOf(state, seat)) {
      const rank = tryOrder(card);
      if (rank === null) continue;
      if (rank === RESET_RANK || rank === BLIND_RANK || rank === BURN_RANK) continue;
      if (rank < bestRank) {
        bestRank = rank;
        bestSeat = seat;
      }
    }
  }
  return bestSeat ?? rng.int(state.seats);
}

/** Table-order rank straight from the deck, re-exported for bot/UI use. */
export { orderOf };
