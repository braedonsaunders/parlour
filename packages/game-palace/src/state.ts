import type { CardId, SeatId } from '@parlour/engine';
import type { PalaceRules } from './config';

/** The run of same-rank cards currently sitting on top of the pile. */
export interface TopRun {
  rank: number;
  count: number;
}

/**
 * One Palace session spans the whole match: deals, swaps and round wins live
 * in a single deterministic log. `round` is the 0-based index of the round in
 * progress.
 */
export interface PalaceState {
  seats: number;
  rules: PalaceRules;
  /** banked round wins per seat across the match */
  roundsWon: readonly number[];
  /** 0-based index of the current (or just-finished) round */
  round: number;
  hands: readonly CardId[][];
  /** up to 3 face-up cards per seat, table furniture above the hand */
  up: readonly CardId[][];
  /** up to 3 face-down cards per seat; contents are opaque until flipped */
  down: readonly CardId[][];
  /** every card live on the centre pile, oldest first */
  pile: readonly CardId[];
  /** cards burned out of the game this round, oldest first */
  burn: readonly CardId[];
  /** the rank the next play must equal or beat, or null while the table is open */
  floor: number | null;
  /** the run of same-rank cards on top of the pile, for the four-kind burn */
  topRun: TopRun | null;
  /** seat deciding right now, or null before the swap phase resolves it */
  turn: SeatId | null;
  /** seats that have used their one swap action this round */
  swapped: readonly SeatId[];
  /** seats ready to leave the swap phase */
  readied: readonly SeatId[];
  /** the seat that emptied hand + up + down first this round, if any */
  roundWinner: SeatId | null;
  /** this round's finish ranking — winner first, then by cards held */
  lastOrder: readonly SeatId[] | null;
  /** true when this round was dealt under Veil */
  veiled: boolean;
}
