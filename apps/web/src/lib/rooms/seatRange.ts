/**
 * Per-game room capacity, in one neutral place. The shared table shell and P2P
 * stack read this instead of hard-coding "2–4", so wide games (President's
 * 4–8 ring, Oh Hell's 5–7 later) plug in without transport changes.
 *
 * The table is a total `Record`, so a new game cannot be added to the shelf and
 * forgotten here — omitting it is a compile error rather than a silent 2–4.
 * `seatRangeFor` still tolerates an unknown *string*, because room settings
 * arrive over the network from peers that may be running a different build.
 */

import { isMultiplayerGameId, type MultiplayerGameId } from './gameIds';

export interface SeatRange {
  min: number;
  max: number;
}

export const DEFAULT_SEAT_RANGE: SeatRange = { min: 2, max: 4 };

const SEAT_RANGES: Readonly<Record<MultiplayerGameId, SeatRange>> = {
  blitz: { min: 2, max: 4 },
  // Two exactly. Both used to fall through to the 2–4 default even though
  // their catalogs offer only `[2]`, so a forged announcement for a 3-seat
  // table passed validation and then threw inside `createSession`.
  cribbage: { min: 2, max: 2 },
  gin: { min: 2, max: 2 },
  wildpile: { min: 2, max: 4 },
  ratscrew: { min: 2, max: 4 },
  euchre: { min: 4, max: 4 },
  // Four exactly: `heartsGame.setup` throws below it — same latent bug.
  hearts: { min: 4, max: 4 },
  president: { min: 4, max: 8 },
  spades: { min: 4, max: 4 },
};

export function seatRangeFor(gameId: string | null | undefined): SeatRange {
  return isMultiplayerGameId(gameId) ? SEAT_RANGES[gameId] : DEFAULT_SEAT_RANGE;
}

/** True when `seats` is an integer inside the game's supported ring. */
export function hasValidSeatCount(gameId: string | null | undefined, seats: number): boolean {
  const { min, max } = seatRangeFor(gameId);
  return Number.isInteger(seats) && seats >= min && seats <= max;
}
