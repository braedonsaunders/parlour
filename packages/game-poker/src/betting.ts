import { advanceSeat, type SeatId } from '@parlour/engine';
import { blindsForLevel } from './config';
import {
  actingSeats,
  contestingSeats,
  livingSeats,
  potSoFar,
  toCall,
  type PokerState,
} from './state';

/** The next seat still in the match, walking clockwise from `from`. */
export function nextLiving(state: PokerState, from: SeatId): SeatId {
  for (let step = 1; step <= state.seats; step++) {
    const seat = advanceSeat(from, state.seats, step);
    if (!state.out[seat]) return seat;
  }
  return from;
}

/** True when the table is down to two players and the button posts the small blind. */
export function isHeadsUp(state: PokerState): boolean {
  return livingSeats(state).length === 2;
}

export function smallBlindSeat(state: PokerState): SeatId {
  // Heads-up, the button *is* the small blind and acts first before the flop.
  // Getting this backwards is the most common heads-up bug in a poker engine.
  return isHeadsUp(state) ? state.button : nextLiving(state, state.button);
}

export function bigBlindSeat(state: PokerState): SeatId {
  return nextLiving(state, smallBlindSeat(state));
}

/** Under the gun: left of the big blind, or the button when heads-up. */
export function firstToActPreflop(state: PokerState): SeatId {
  return isHeadsUp(state) ? state.button : nextLiving(state, bigBlindSeat(state));
}

/** After the flop the small blind leads — heads-up that is the seat off the button. */
export function firstToActPostflop(state: PokerState): SeatId {
  return isHeadsUp(state) ? nextLiving(state, state.button) : smallBlindSeat(state);
}

/**
 * The next seat owed a turn, starting the search after `from`.
 *
 * Returns null when the betting round is finished — every seat that could act
 * has acted, and everyone still in has either matched the bet or is all-in.
 */
export function nextActor(state: PokerState, from: SeatId): SeatId | null {
  for (let step = 1; step <= state.seats; step++) {
    const seat = advanceSeat(from, state.seats, step);
    if (state.out[seat] || state.folded[seat] || state.allIn[seat]) continue;
    if (state.needsToAct[seat]) return seat;
  }
  return null;
}

/** The first seat owed a turn at or after `from`, `from` included. */
export function actorFrom(state: PokerState, from: SeatId): SeatId | null {
  if (!state.out[from] && !state.folded[from] && !state.allIn[from] && state.needsToAct[from]) {
    return from;
  }
  return nextActor(state, from);
}

export function bettingClosed(state: PokerState): boolean {
  return actingSeats(state).every((seat) => !state.needsToAct[seat]);
}

/**
 * Betting needs two seats with chips behind them. One player left with a stack
 * has nobody to bet into, so the rest of the board simply runs out.
 */
export function bettingPossible(state: PokerState): boolean {
  return actingSeats(state).length >= 2 && contestingSeats(state).length >= 2;
}

/** Everything a seat could put in this street, all-in included. */
export function allInTo(state: PokerState, seat: SeatId): number {
  return (state.streetBet[seat] ?? 0) + (state.stacks[seat] ?? 0);
}

/**
 * The smallest legal raise, as a total to raise *to*.
 *
 * A raise must lift the bet by at least the last full raise — before the flop
 * that floor is the big blind. A seat too short to make it may still shove; the
 * caller checks that against {@link allInTo}.
 */
export function minRaiseTo(state: PokerState): number {
  return state.currentBet + state.lastRaiseSize;
}

/** A raise to exactly the size of the pot, the way a pot-limit table counts it. */
export function potRaiseTo(state: PokerState, seat: SeatId): number {
  return state.currentBet + potSoFar(state) + toCall(state, seat);
}

/** True when the seat has enough chips to make a full legal raise. */
export function canRaise(state: PokerState, seat: SeatId): boolean {
  if (!state.mayRaise[seat]) return false;
  if (!bettingPossible(state)) return false;
  return allInTo(state, seat) > state.currentBet;
}

function roundToChip(amount: number, step: number): number {
  if (step <= 1) return Math.round(amount);
  return Math.round(amount / step) * step;
}

/**
 * A short ladder of raise sizes: the minimum, a few pot fractions, and all-in.
 *
 * The rules accept any amount between the minimum and a shove — `validate` is
 * continuous, so a slider in the web UI is free. This ladder exists so bots
 * have a finite set to choose from and so the table can offer sane quick
 * buttons instead of making someone dial in 137.
 */
export function raiseLadder(state: PokerState, seat: SeatId): number[] {
  if (!canRaise(state, seat)) return [];

  const shove = allInTo(state, seat);
  const floor = Math.min(minRaiseTo(state), shove);
  const step = Math.max(1, blindsForLevel(state.level).small);
  const pot = potRaiseTo(state, seat);
  const call = toCall(state, seat);
  const potAfterCall = potSoFar(state) + call;

  const sizes = [
    floor,
    roundToChip(state.currentBet + potAfterCall / 2, step),
    roundToChip(state.currentBet + (potAfterCall * 3) / 4, step),
    roundToChip(pot, step),
    shove,
  ];

  return [...new Set(sizes)]
    .filter((size) => size >= floor && size <= shove)
    .sort((left, right) => left - right);
}
