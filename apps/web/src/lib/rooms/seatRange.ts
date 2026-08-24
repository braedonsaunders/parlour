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

/**
 * Every ring the app knows, stated once.
 *
 * This stays a leaf module with no game imports: the room registry, the P2P
 * transport, and the engine authority all read it, and two of those are
 * imported *by* the registry, so sourcing it the other way round would close a
 * cycle. Games whose ring is the default 2–4 are listed anyway — a reader
 * should not have to know which omissions are deliberate.
 */
const SEAT_RANGES: Readonly<Record<string, SeatRange>> = {
  blitz: { min: 2, max: 4 },
  wildpile: { min: 2, max: 4 },
  eights: { min: 2, max: 6 },
  ratscrew: { min: 2, max: 4 },
  hearts: { min: 2, max: 4 },
  gin: { min: 2, max: 4 },
  // Cribbage is a two-hander, but its ring stays the shared 2–4 so the room
  // rejects a third seat with the game's own sentence rather than a bare range.
  // See `seatsRefusal` in the room registry.
  cribbage: { min: 2, max: 4 },
  euchre: { min: 4, max: 4 },
  spades: { min: 4, max: 4 },
  poker: { min: 2, max: 6 },
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
