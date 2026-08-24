import type { CardId, SeatId } from '@parlour/engine';
import type { PokerRules } from './config';
import type { HandRank } from './evaluate';
import type { PotAward, SidePot } from './pot';

/**
 * Where a hand is.
 *
 * `showdown` is a settled state, not a moment — the hand is scored and the
 * table is reading it. `hand-over` means the chips have moved and the next deal
 * is due.
 */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand-over';

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'blind' | 'ante';

export interface ActionRecord {
  seat: SeatId;
  kind: ActionKind;
  /** chips this action moved out of the stack */
  amount: number;
  /** the street bet this action left in front of the seat */
  to: number;
  street: Street;
  allIn: boolean;
}

export interface ShownHand {
  seat: SeatId;
  hole: readonly CardId[];
  /** null when the seat folded before the river and never had to show */
  rank: HandRank | null;
  mucked: boolean;
}

export interface HandSummary {
  handNo: number;
  button: SeatId;
  board: readonly CardId[];
  pots: readonly SidePot[];
  awards: readonly PotAward[];
  /** chips won minus chips committed, per seat */
  net: readonly number[];
  stacksAfter: readonly number[];
  shown: readonly ShownHand[];
  /** true when everyone folded and no hand was compared */
  walkover: boolean;
  /** seats that ran out of chips on this hand, in bust order */
  busted: readonly SeatId[];
}

/**
 * One sit-and-go, start to finish, inside a single deterministic session.
 *
 * Stacks, blinds and the button live here rather than in a wrapper so the table
 * snapshot and the match can never disagree about who has what.
 */
export interface PokerState {
  rules: PokerRules;
  seats: number;
  /** 1-based hand counter */
  handNo: number;
  /** index into the blind ladder */
  level: number;
  handsThisLevel: number;
  button: SeatId;
  stacks: readonly number[];
  /** seats with no chips left; they are dealt out and never act again */
  out: readonly boolean[];
  /** bust order, earliest first — the back half of the final standings */
  bustOrder: readonly SeatId[];

  hole: CardId[][];
  board: readonly CardId[];
  /** the undealt remainder of this hand's deck, in deal order */
  deck: readonly CardId[];

  street: Street;
  folded: readonly boolean[];
  allIn: readonly boolean[];
  /** every chip a seat has put in this hand — the basis for side pots */
  committed: readonly number[];
  /** chips in front of a seat on this street, matched against `currentBet` */
  streetBet: readonly number[];
  currentBet: number;
  /** the last full raise increment; the floor under the next legal raise */
  lastRaiseSize: number;
  /** seats still owed a turn before this betting round can close */
  needsToAct: readonly boolean[];
  /**
   * Seats allowed to raise rather than only call. An all-in that is short of a
   * full raise reopens the action for callers but not their right to re-raise.
   */
  mayRaise: readonly boolean[];
  turn: SeatId | null;
  /** last seat to bet or raise this street */
  aggressor: SeatId | null;
  /** seats whose hole cards are face up to the table */
  shown: readonly boolean[];

  actions: readonly ActionRecord[];
  /** this hand's result while `street === 'hand-over'` */
  summary: HandSummary | null;
  /** survives the next deal so the table can still show what just happened */
  lastHand: HandSummary | null;
}

/** Seats that are dealt in this hand — not busted. */
export function livingSeats(state: PokerState): SeatId[] {
  return Array.from({ length: state.seats }, (_, seat) => seat).filter((seat) => !state.out[seat]);
}

/** Seats still contesting the pot — dealt in and not folded. */
export function contestingSeats(state: PokerState): SeatId[] {
  return livingSeats(state).filter((seat) => !state.folded[seat]);
}

/** Seats that can still put chips in — contesting and not already all-in. */
export function actingSeats(state: PokerState): SeatId[] {
  return contestingSeats(state).filter((seat) => !state.allIn[seat]);
}

export function potSoFar(state: PokerState): number {
  return state.committed.reduce((sum, amount) => sum + amount, 0);
}

/** What it costs the seat to match the current bet. */
export function toCall(state: PokerState, seat: SeatId): number {
  const owed = state.currentBet - (state.streetBet[seat] ?? 0);
  return Math.max(0, Math.min(owed, state.stacks[seat] ?? 0));
}
