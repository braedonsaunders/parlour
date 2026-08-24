import type { CardId, SeatId } from '@parlour/engine';
import type { SpiteRules } from './config';

/**
 * One shared centre build pile. `nextRank` is the whole rule: it is stored,
 * not derived, because a wild on top stands for a rank nobody could recover
 * from the card faces alone. When the pile completes past Queen the pile is
 * emptied back into the stock and `nextRank` returns to Ace.
 */
export interface CentrePile {
  /** Cards bottom-to-never-mind: index 0 is the TOP of the pile. */
  cards: CardId[];
  /** Rank the next card must carry — 1 (Ace) on an empty pile. */
  nextRank: number;
}

export function emptyCentre(): CentrePile {
  return { cards: [], nextRank: 1 };
}

/**
 * Spite & Malice state.
 *
 * Zone convention follows the house style: index 0 is the exposed end of every
 * pile. For payoffs that is the face-up top card; for discard piles and centre
 * piles it is the last card played; for the stock it is the next card drawn.
 * The nesting is deeper than Blitz's flat zones but stays made of plain arrays
 * and strings, which is exactly what the engine's structural tooling (state
 * hash, Veil substitution) walks.
 */
export interface SpiteState {
  /** resolved house rules for this match — pure reducers read them from here */
  rules: SpiteRules;
  seats: number;
  /** per seat, the live hand */
  hands: CardId[][];
  /**
   * per seat, the face-down payoff pile with its top card at index 0. The
   * whole race lives here: first seat to play this array empty wins.
   */
  payoffs: CardId[][];
  /** per seat, `rules.discardPiles` personal piles, anything-on-anything */
  discards: CardId[][][];
  /** shared draw stock, index 0 drawn first */
  stock: CardId[];
  /** the shared centre builds, length `rules.buildPiles` */
  centre: CentrePile[];
  /**
   * What each played wild is standing for. Keyed by card id because the wild's
   * position in a pile is presentation; the recorded rank is rules.
   */
  wildRanks: Record<CardId, number>;
  turn: SeatId;
  /**
   * False until the current actor has had their opening refill. Setup deals
   * full hands, so the match opens with it already true.
   */
  started: boolean;
  /**
   * Consecutive seats skipped for having nothing legal to do. Reaching every
   * seat means the table is deadlocked — stock dry, no playable tops — and
   * the match is settled by closest-to-victory instead of stalling forever.
   */
  stuckRuns: number;
  winner: SeatId | null;
}
