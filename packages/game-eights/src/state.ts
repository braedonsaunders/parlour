import type { CardId, SeatId } from '@parlour/engine';
import type { EightsSuit } from './cards';
import type { EightsRules } from './config';

/** How a round stopped: someone shed, or the table ran out of moves. */
export type EightsRoundReason = 'shed' | 'blocked';

export interface EightsRoundOutcome {
  /** The seat that scores. On a block that is the lightest hand at the table. */
  winner: SeatId;
  /** Points the winner banks for this round. */
  points: number;
  /** What every seat was still holding when the round closed. */
  handValues: readonly number[];
  /** Cards every seat was still holding, for the round-end readout. */
  handCounts: readonly number[];
  reason: EightsRoundReason;
}

/** One deal: cards on the table until a hand empties or the play dries up. */
export interface EightsRound {
  hands: CardId[][];
  stock: CardId[];
  /** Top-first, exactly like every other parlour discard. */
  discard: CardId[];
  turn: SeatId;
  direction: 1 | -1;
  /**
   * The suit the pile is asking for. It follows the top card except after an
   * eight, which names its own — so this is the authority, never the top face.
   */
  activeSuit: EightsSuit;
  /** Cards riding on an unanswered two. */
  pendingDraw: number;
  /** Seat that played an eight and still owes the table a suit. */
  awaitingSuit: SeatId | null;
  /**
   * Card the seat just drew and may still play. While it is set the turn stays
   * put: the seat either plays it or passes (unless `forcePlay` removes the
   * choice).
   */
  drawnCard: CardId | null;
  outcome: EightsRoundOutcome | null;
}

/**
 * The whole match in one deterministic session.
 *
 * Crazy Eights is a race to a score across many deals, and friend rooms run on
 * a single replayable session, so the match layer lives inside the game def the
 * way Gin's does: `round.fold` banks the points, seats ready up in the
 * round-end window, and `next.round` deals again from the per-event rng stream.
 */
export interface EightsState {
  seats: number;
  rules: EightsRules;
  scores: number[];
  roundsWon: number[];
  /** 0-based index of the round on the table. */
  roundIndex: number;
  dealer: SeatId;
  round: EightsRound;
  /** True once this round's points have been banked. */
  folded: boolean;
  readied: SeatId[];
  lastOutcome: EightsRoundOutcome | null;
}
