import type { CardId, MatchResultRank, SeatId } from '@parlour/engine';
import type { GinConfig } from './config';

/** Open information: everyone sees who takes which discard. */
export interface Pickup {
  seat: SeatId;
  card: CardId;
}

export type HandReason = 'knock' | 'gin' | 'big-gin' | 'undercut' | 'dead-hand';

export interface LayoffRecord {
  card: CardId;
  /** index into the knocker's meld list the card was laid onto */
  meldIndex: number;
}

export interface HandOutcome {
  reason: HandReason;
  knocker: SeatId | null;
  /** seat receiving the hand points, or null for a dead hand */
  scorer: SeatId | null;
  /** raw points scored (deadwood difference + bonuses), before any box bonus */
  points: number;
  layoffs: readonly LayoffRecord[];
  /** final per-seat deadwood after layoffs (knocker first) */
  deadwood: readonly number[];
  /** points added per seat this hand */
  handScores: readonly number[];
}

/** One complete gin rummy hand (deal → knock/gin/dead). */
export interface GinState {
  rules: GinConfig;
  seats: number;
  veiled: boolean;
  dealer: SeatId;
  hands: readonly CardId[][];
  stock: readonly CardId[];
  discard: readonly CardId[];
  turn: SeatId;
  /** seat deciding on the opening upcard, while the option phase runs */
  optionSeat: SeatId | null;
  passedUpcard: boolean;
  /** set when both seats passed — the non-dealer owes an automatic stock draw */
  forceStockDraw: boolean;
  drawnFromStock: CardId | null;
  drawnFromDiscard: CardId | null;
  knocker: SeatId | null;
  /** completed turns since the last stock draw — the pile-trade stall guard */
  quietTurns: number;
  pickups: readonly Pickup[];
  outcome: HandOutcome | null;
}

/**
 * The full match as one deterministic session: cumulative scores across hands,
 * dealer rotation, and the hand-end ready window. This is the def friend rooms
 * and solo play both drive, so P2P needs zero match-layer plumbing.
 */
export interface GinMatchState {
  rules: GinConfig;
  seats: number;
  veiled: boolean;
  scores: readonly number[];
  handsWon: readonly number[];
  handIndex: number;
  dealer: SeatId;
  hand: GinState;
  /** current hand's outcome already folded into the running scores */
  folded: boolean;
  /** seats that tapped "next" during the hand-end window */
  readied: readonly SeatId[];
  lastOutcome: HandOutcome | null;
}

export interface GinHandRankDetail extends MatchResultRank {
  detail?: { deadwood?: number; score?: number; reason?: string };
}
