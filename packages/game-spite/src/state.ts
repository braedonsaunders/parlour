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
   *
   * ## Veil impossibility
   *
   * Veiled friend rooms are not supported ({@link apps/web/src/lib/rooms/gameRegistry.ts}
   * carries the refusal). The reason is structural, not cosmetic:
   *
   * Under Veil the top card (index 0) is public and everything under it is an
   * opaque handle. When the top is played, {@link game.ts} `build.apply` does
   * `pileCards.slice(1)`, which makes the former index-1 slide to index 0 in a
   * single atomic state transition. The newly-exposed card was private and is
   * now public — but this exposure is a *side effect* of the play, not a
   * distinct game move. There is no "reveal top" action in the rules.
   *
   * The engine's `VeilSupport.publicOpens` hook (Poker uses it for the board)
   * expresses "open these handles, then inject this move" — it needs a named
   * move that the flow can pause at. Spite's flow advances directly from one
   * `build` to the next player's turn with no interposable reveal step, and
   * adding one would split a single player action into "play" + "reveal" — a
   * rules change the Veil protocol must not impose.
   *
   * What would be needed to lift this ceiling:
   *   1. An engine-level primitive for "became-public-as-side-effect" openings
   *      that does not require a distinct move.
   *   2. Or a `build.apply` refactor that, under Veil, sets a `revealPending`
   *      flag and pauses the flow, with the room injecting a reveal before the
   *      turn passes. Both paths require engine changes beyond the pack layer.
   *
   * Until then, a clear refusal is safer than a half-working privacy claim.
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
