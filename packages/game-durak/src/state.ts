import type { CardId, SeatId } from '@parlour/engine';
import type { DurakSuit } from './cards';
import type { DurakRules } from './config';

/** One attack card on the table, and whatever has beaten it so far. */
export interface DurakTablePair {
  attack: CardId;
  defend: CardId | null;
}

/** The final result of a hand: who was left holding cards, and in what order the rest went out. */
export interface DurakOutcome {
  /**
   * The seat still holding cards when everyone else emptied their hand — the
   * Durak. Null on the rare hand where the last two seats empty their hands
   * in the very same exchange: nobody is left to be the fool.
   */
  loser: SeatId | null;
  /** Every other seat, in the order it emptied its hand — first out is first in this list. */
  order: readonly SeatId[];
}

/**
 * Durak is a single hand, not a race across many deals: the moment one seat is
 * left holding cards it is the Durak, and the match is over. There is no round
 * wrapper the way Eights or Gin need, so the whole game lives in one state.
 */
export interface DurakState {
  seats: number;
  rules: DurakRules;
  veiled: boolean;
  hands: CardId[][];
  /**
   * The draw queue, in draw order. The trump card rides at the very bottom
   * (the last entry) exactly as it does at a physical table: it stays face up
   * for everyone to see, and is the last card anyone draws.
   */
  stock: CardId[];
  trumpCard: CardId;
  trumpSuit: DurakSuit;
  table: DurakTablePair[];
  /** The seat that opened this bout. Stays fixed even if the defender changes via transfer. */
  attacker: SeatId;
  defender: SeatId;
  /**
   * Seats still eligible to throw a card into this bout, in throw-in order
   * (the primary attacker first, then clockwise, defender excluded).
   */
  attackers: readonly SeatId[];
  /** Subset of `attackers` who have declared they have nothing more to throw in. */
  passed: readonly SeatId[];
  /** Most attack cards this bout may ever hold, fixed when the bout (or the current defender) began. */
  attackCap: number;
  /** How many bouts have finished. Presentation only — replays are keyed on the event log, not this. */
  boutIndex: number;
  /** Seats that have emptied their hand with the stock spent, in the order it happened. */
  out: readonly SeatId[];
  outcome: DurakOutcome | null;
}
