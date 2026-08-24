import type { CardId, MatchResultRank, SeatId } from '@parlour/engine';
import type { CribbageConfig } from './config';

/** The classic race: first peg to 121 wins. */
export const TARGET_SCORE = 121;
/** Below this line the loser is skunked (when the house rule is on). */
export const SKUNK_LINE = 90;

export const HAND_DEAL_SIZE = 6;
export const HAND_PEG_SIZE = 4;

/**
 * One deal of cribbage, from the shuffle through pegging into the show. A
 * complete game to 121 is a single deterministic session of these deals; the
 * dealer rotates inside `deal.next`.
 */
export interface CribbageState {
  /** resolved house rules for this game — pure reducers read them from here */
  rules: CribbageConfig;
  seats: number;
  veiled: boolean;

  dealer: SeatId;
  /** 0-based count of deals completed in this game */
  dealNo: number;

  hands: readonly CardId[][];
  crib: readonly CardId[];
  /** undealt remainder after dealing six to each seat (includes the future starter) */
  stock: readonly CardId[];
  /** every card laid to the table this deal, across all sequences */
  played: readonly CardId[];
  /**
   * Cards each seat laid to the table this deal, by seat — the four-card
   * hands that come back off the table for the show.
   */
  pegged: readonly CardId[][];
  starter: CardId | null;
  /** true once this deal's show has been counted aloud */
  showDone: boolean;

  pegging: PeggingState;
  totals: readonly number[];
  /**
   * Muggins bookkeeping: points earned at the table but not yet claimed by
   * their earner — any other seat may steal them. Never set when muggins is
   * off, and voided when the deal ends.
   */
  unclaimed: { seat: SeatId; points: number } | null;

  outcome: GameOutcome | null;
}

export interface PeggingState {
  /** cards played since the count last reset, in play order */
  pile: readonly CardId[];
  /** who played each card, parallel to `pile` */
  owners: readonly SeatId[];
  /** running pip-count total of `pile` */
  count: number;
  /** seat to act next, or null while pegging is not underway */
  turn: SeatId | null;
  /** seats that announced go during the current sequence */
  passed: readonly SeatId[];
}

export interface GameOutcome {
  winner: SeatId;
  finalTotals: readonly number[];
  /** true when the loser finished below the skunk line under the house rule */
  skunked: boolean;
  reason: '121' | 'skunk';
  rankings: readonly MatchResultRank[];
}
