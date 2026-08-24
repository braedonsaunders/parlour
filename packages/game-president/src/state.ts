import type { CardId, SeatId } from '@parlour/engine';
import type { PresidentRules } from './config';

/** The set currently standing on the pile — beat it or pass. */
export interface StandingSet {
  seat: SeatId;
  cards: readonly CardId[];
  /** table-order rank, 3…15 */
  rank: number;
}

/** A completed exchange packet: gifts flow down, returns flow back up. */
export interface ExchangeMove {
  from: SeatId;
  to: SeatId;
  cards: readonly CardId[];
}

export type PresidentRole = 'president' | 'vice' | 'neutral' | 'vice-scum' | 'scum';

/**
 * One President session spans the whole match: deals, exchanges and score
 * accrual live in a single deterministic log. `deal` is the 0-based index of
 * the deal in progress; `finished` is the current deal's go-out order.
 */
export interface PresidentState {
  seats: number;
  rules: PresidentRules;
  /** banked position points per seat across deals */
  score: readonly number[];
  /** 0-based index of the current (or just-finished) deal */
  deal: number;
  hands: readonly CardId[][];
  /** every card played to the current trick, oldest first */
  pile: readonly CardId[];
  /** cards from swept piles this deal — dead cards waiting for the redeal */
  captured: readonly CardId[];
  /** the set waiting to be beaten, or null while the trick leader chooses */
  standing: StandingSet | null;
  /** seat deciding right now during play */
  turn: SeatId | null;
  /** consecutive passes since the last play — a full cycle ends the trick */
  passedCycle: readonly SeatId[];
  /** seats barred from the rest of this trick (locked-pass variant) */
  lockedOut: readonly SeatId[];
  /** this deal's finish order so far; the last seat left standing is scum */
  finished: readonly SeatId[];
  /** finish order of the previous deal, or null before any deal completed */
  lastOrder: readonly SeatId[] | null;
  /** seats still owing their exchange gift */
  awaitingGive: readonly SeatId[];
  /** seat picking return cards next, with how many */
  awaitingReturn: { seat: SeatId; count: number } | null;
  /** exchange packets recorded for the transition into the upcoming deal */
  exchangeLog: readonly ExchangeMove[];
}
