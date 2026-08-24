import type { CardId, MatchResultRank, SeatId } from '@parlour/engine';
import type { BlitzConfig } from './config';

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
  /**
   * True when the round is dealt under Veil: hands hold opaque handles instead
   * of faces. The table can no longer see a 31, so a blitz arrives as a claim
   * that opens the claimant's hand, and the showdown is preceded by a reveal
   * phase. See docs/VEILED-DECK-PROTOCOL.md §5.
   */
  veiled: boolean;
}
