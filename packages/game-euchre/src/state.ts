import type { CardId, SeatId } from '@parlour/engine';
import type { EuchreRules } from './config';
import type { EuchreSuit } from './deck';

export type EuchreStage = 'bidding' | 'discarding' | 'playing' | 'hand-over';

export interface EuchreBidRecord {
  seat: SeatId;
  bid: 'order-up' | 'pass' | 'call';
  alone?: boolean;
}

export interface TrickPlay {
  seat: SeatId;
  card: CardId;
}

export type HandScoreReason = 'taken' | 'march' | 'march-alone' | 'euchred';

export interface HandSummary {
  handNo: number;
  dealer: SeatId;
  makerTeam: 0 | 1;
  caller: SeatId;
  alone: boolean;
  trump: EuchreSuit;
  makerTricks: number;
  defenderTricks: number;
  /** points awarded to the makers (0 when euchred) */
  makerPoints: number;
  /** points awarded to the defenders (>0 only on a euchre) */
  defenderPoints: number;
  reason: HandScoreReason;
}

export interface EuchreState {
  rules: EuchreRules;
  veiled: boolean;
  scores: readonly [number, number];
  /** 1-based hand counter; increments on redeals too */
  handNo: number;
  dealer: SeatId;
  hands: CardId[][];
  /**
   * The four undealt cards. During the first bidding round kitty[0] is face up
   * and mirrored in `upcard`; afterwards every kitty card is face down.
   */
  kitty: CardId[];
  /** the face-up card while bidding round 1 is live; null once resolved */
  upcard: CardId | null;
  /** the card everyone passed on — it is buried and cannot be named in round 2 */
  turnedDown: CardId | null;
  stage: EuchreStage;
  biddingRound: 1 | 2;
  turn: SeatId;
  passesThisRound: number;
  bids: readonly EuchreBidRecord[];
  trump: EuchreSuit | null;
  caller: SeatId | null;
  alone: boolean;
  /** the caller's partner while a lone hand runs; null otherwise */
  sittingOut: SeatId | null;
  leader: SeatId | null;
  trick: readonly TrickPlay[];
  tricksPlayed: number;
  trickWinners: readonly SeatId[];
  summary: HandSummary | null;
}
