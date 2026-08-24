import type { CardId, SeatId } from '@parlour/engine';
import type { Trick } from '@parlour/tricks';
import type { HeartsRules } from './config';

/** One hand of Hearts: deal → (pass) → 13 tricks → score. A match stacks hands. */
export interface HeartsState {
  seats: number;
  rules: HeartsRules;
  /** true when this round was dealt under Veil (hands are opaque handles) */
  veiled: boolean;
  /** 0-based index of this hand inside its match; informational for a lone hand */

  hands: CardId[][];
  /**
   * Simultaneous pass picks. Every seat chooses concurrently behind this wall;
   * the wall drops for everyone at once when the last selection lands.
   */
  selections: (readonly CardId[] | null)[];
  passing: boolean;

  trick: Trick | null;
  leader: SeatId;
  turn: SeatId;

  taken: CardId[][];
  tricksWon: number[];
  /** every card played this hand, in order — the audit trail for Veil rooms */
  plays: readonly { seat: SeatId; card: CardId }[];

  heartsBroken: boolean;
  tricksPlayed: number;
  /**
   * True once the two of clubs has landed. Open tables know the holder from
   * the deal and skip straight to them; Veil tables cannot read hands, so
   * every seat stays eligible until someone's opened two of clubs lands.
   */
  ledTwoClubs: boolean;
  handOver: boolean;

  /** filled when the thirteenth trick collects; null until then */
  handPoints: readonly number[] | null;
  moonShooter: SeatId | null;
  /** Veil showdown bookkeeping: which seats opened their remaining hand */
  openedUp: boolean[];
  /** seats whose plays broke follow-suit, set by the Veil showdown audit */
  disputed: readonly SeatId[];
}

export const HEARTS_SEATS = 4;
export const HAND_SIZE = 13;
export const TRICKS_PER_HAND = HAND_SIZE;
