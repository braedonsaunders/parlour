/**
 * Per-game room capacity, in one neutral place. The shared table shell and P2P
 * stack read this instead of hard-coding "2–4", so wide games (President's
 * 4–8 ring today, Oh Hell's 5–7 later) plug in without transport changes.
 */
export interface SeatRange {
  min: number;
  max: number;
}

export const DEFAULT_SEAT_RANGE: SeatRange = { min: 2, max: 4 };

const SEAT_RANGES: Readonly<Record<string, SeatRange>> = {
  euchre: { min: 4, max: 4 },
  president: { min: 4, max: 8 },
};

export function seatRangeFor(gameId: string | null | undefined): SeatRange {
  if (gameId && SEAT_RANGES[gameId]) return SEAT_RANGES[gameId]!;
  return DEFAULT_SEAT_RANGE;
}

/** True when `seats` is an integer inside the game's supported ring. */
export function hasValidSeatCount(gameId: string | null | undefined, seats: number): boolean {
  const { min, max } = seatRangeFor(gameId);
  return Number.isInteger(seats) && seats >= min && seats <= max;
}
