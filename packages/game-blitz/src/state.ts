import type { CardId, MatchResultRank, SeatId } from '@parlour/engine';
import type { BlitzConfig } from './config';

/** Seats that have already lost their last life and sit the rest of the match. */
export function sittingOut(state: Pick<BlitzState, 'out'>): readonly SeatId[] {
  return state.out ?? [];
}

export function isSittingOut(state: Pick<BlitzState, 'out'>, seat: SeatId): boolean {
  return sittingOut(state).includes(seat);
}

/** Seats still in the match, in seat order. */
export function liveSeats(state: Pick<BlitzState, 'seats' | 'out'>): SeatId[] {
  return Array.from({ length: state.seats }, (_, seat) => seat).filter(
    (seat) => !isSittingOut(state, seat),
  );
}

/** Open information: everyone at the table sees who takes which discard. */
export interface Pickup {
  seat: SeatId;
  card: CardId;
}

export type RoundReason = 'blitz' | 'showdown' | 'redeal';

export interface RoundOutcome {
  reason: RoundReason;
  /** seats sharing first place after tie/penalty rules (redeal: empty) */
  winners: readonly SeatId[];
  rankings: readonly MatchResultRank[];
}

/** Per-seat counters the podium reports, banked round by round. */
export interface BlitzSeatMetrics {
  blitzes: number;
  knocks: number;
  knockWins: number;
}

/** Classic knockout, or a race to a number of round wins. */
export type BlitzMatchFormat = 'lives' | 'wins';

/**
 * A whole Blitz match as one state.
 *
 * Blitz is a match of many rounds — you start on three lives and play until one
 * seat is left holding any — and a friend room is a single replicated session,
 * not a series of them. So the match layer lives inside the game def, the way
 * Gin's does: `round.fold` banks the lives, seats ready up in the window after
 * it, and `next.round` deals again from the per-event rng stream.
 *
 * The alternative, which is what rooms used to play, is a session per round:
 * the room ends after one deal, nobody's lives ever move, and the podium is
 * handed a single round's hand values instead of a match score.
 */
export interface BlitzMatchState {
  rules: BlitzConfig;
  seats: number;
  veiled: boolean;
  format: BlitzMatchFormat;
  /** Round wins that take the match, in the `wins` format. */
  target: number;
  lives: readonly number[];
  wins: readonly number[];
  metrics: readonly BlitzSeatMetrics[];
  roundIndex: number;
  round: BlitzState;
  /** True once the finished round has been banked and the table is between rounds. */
  folded: boolean;
  readied: readonly SeatId[];
  lastOutcome: RoundOutcome | null;
}

export interface BlitzState {
  /** resolved house rules for this round — pure reducers read them from here */
  rules: BlitzConfig;
  seats: number;
  hands: readonly CardId[][];
  stock: readonly CardId[];
  discard: readonly CardId[];
  turn: SeatId;
  knocker: SeatId | null;
  /** remaining extra turns after the knock before showdown */
  postKnockTurns: number;
  /** the card the current actor just took off the discard pile (discard lock) */
  drawnFromDiscard: CardId | null;
  pickups: readonly Pickup[];
  outcome: RoundOutcome | null;
  /** seats already eliminated from the match — they are not dealt and never act */
  out: readonly SeatId[];
  /**
   * True when the round is dealt under Veil: hands hold opaque handles instead
   * of faces. The table can no longer see a 31, so a blitz arrives as a claim
   * that opens the claimant's hand, and the showdown is preceded by a reveal
   * phase. See apps/web/src/lib/multiplayer/veil.
   */
  veiled: boolean;
}
