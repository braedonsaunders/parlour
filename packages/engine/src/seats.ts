import type { SeatId } from './types';

/**
 * Wraps a movement around a clockwise seat ring. `direction` is normally 1;
 * shedding games pass -1 after a reversal. The result is normalized for both
 * directions, so callers never repeat subtly different modulo expressions.
 */
export function advanceSeat(from: SeatId, seats: number, steps = 1, direction: 1 | -1 = 1): SeatId {
  if (!Number.isInteger(seats) || seats < 1) {
    throw new Error(`seat ring requires a positive seat count, got ${seats}`);
  }
  const offset = direction * steps;
  return (((from + offset) % seats) + seats) % seats;
}

/** Every seat once, clockwise from `start`. */
export function seatOrder(start: SeatId, seats: number): SeatId[] {
  if (seats <= 0) return [];
  return Array.from({ length: seats }, (_, step) => advanceSeat(start, seats, step));
}
