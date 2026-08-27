import type { CardId, SeatId } from '@parlour/engine';
import type { Trick } from '@parlour/tricks';
import type { PinochleSuit } from './cards';
import type { MeldBreakdown } from './meld';
import type { PinochleRules } from './config';

export type PinochleStage =
  'bidding' | 'naming-trump' | 'melding' | 'playing' | 'hand-over' | 'redeal';

export interface PinochleBid {
  seat: SeatId;
  /** the bid amount, or `null` for a pass */
  bid: number | null;
}

export interface TeamHandScore {
  team: 0 | 1;
  meld: number;
  trickPoints: number;
  /** meld + trickPoints, before the bid-team's made/set check applies */
  raw: number;
  isBidTeam: boolean;
  bid: number | null;
  made: boolean | null;
  delta: number;
  scoreAfter: number;
}

export interface HandSummary {
  handNo: number;
  dealer: SeatId;
  bidWinner: SeatId;
  bidTeam: 0 | 1;
  bid: number;
  trump: PinochleSuit;
  meldBySeat: readonly [MeldBreakdown, MeldBreakdown, MeldBreakdown, MeldBreakdown];
  tricksBySeat: readonly [number, number, number, number];
  trickPointsBySeat: readonly [number, number, number, number];
  teams: readonly [TeamHandScore, TeamHandScore];
  set: boolean;
}

/**
 * One continuous partnership match — scores and dealer live here so the table
 * snapshot and the match can never drift apart.
 */
export interface PinochleState {
  rules: PinochleRules;
  /**
   * True when the hands are veil handles rather than faces. Following suit
   * cannot be checked against handles, so it degrades to an audited-friends
   * honour claim, exactly as Euchre/Hearts/Spades do. Confirming meld under
   * Veil opens the whole hand, since meld is computed from real cards.
   */
  veiled: boolean;
  scores: readonly [number, number];
  /** 1-based hand counter */
  handNo: number;
  dealer: SeatId;
  hands: CardId[][];
  stage: PinochleStage;
  turn: SeatId;
  bids: readonly PinochleBid[];
  /** seats still eligible to bid or pass this auction */
  activeBidders: readonly SeatId[];
  highBid: number | null;
  highBidder: SeatId | null;
  trump: PinochleSuit | null;
  melds: readonly (MeldBreakdown | null)[];
  meldConfirmed: readonly boolean[];
  leader: SeatId | null;
  trick: Trick | null;
  tricksPlayed: number;
  trickWinners: readonly SeatId[];
  tricksBySeat: readonly [number, number, number, number];
  trickPointsBySeat: readonly [number, number, number, number];
  /** this hand's result while `stage === 'hand-over'`; cleared on the next deal */
  summary: HandSummary | null;
  /** last completed hand — survives the auto-advance into the next auction */
  lastHand: HandSummary | null;
}
