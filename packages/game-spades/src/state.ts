import type { CardId, SeatId } from '@parlour/engine';
import type { Trick } from '@parlour/tricks';
import type { SpadesRules } from './config';

export type SpadesStage = 'bidding' | 'playing' | 'hand-over';

export interface SpadesBid {
  seat: SeatId;
  tricks: number;
  nil: boolean;
}

export interface TeamHandScore {
  team: 0 | 1;
  contract: number;
  nonNilTricks: number;
  nilTricks: number;
  made: boolean;
  contractDelta: number;
  nilDelta: number;
  overtricks: number;
  bagsTaken: number;
  bagPenalty: number;
  delta: number;
  scoreAfter: number;
  bagsAfter: number;
}

export interface HandSummary {
  handNo: number;
  dealer: SeatId;
  bids: readonly SpadesBid[];
  tricksBySeat: readonly number[];
  teams: readonly [TeamHandScore, TeamHandScore];
}

/**
 * One continuous partnership match. Scores and bags live here (Euchre-style)
 * so a wrapper cannot drift from the table snapshot.
 */
export interface SpadesState {
  rules: SpadesRules;
  veiled: boolean;
  scores: readonly [number, number];
  bags: readonly [number, number];
  /** 1-based hand counter */
  handNo: number;
  dealer: SeatId;
  hands: CardId[][];
  stage: SpadesStage;
  turn: SeatId;
  bids: (SpadesBid | null)[];
  leader: SeatId | null;
  trick: Trick | null;
  tricksPlayed: number;
  trickWinners: readonly SeatId[];
  tricksBySeat: readonly number[];
  spadesBroken: boolean;
  /** every card played this hand — Veil follow-suit audit trail */
  plays: readonly { seat: SeatId; card: CardId }[];
  /** this hand's result while `stage === 'hand-over'`; cleared on the next deal */
  summary: HandSummary | null;
  /**
   * Last completed hand. Survives the open-table auto-advance into the next
   * bidding phase so the web can still render the score breakdown.
   */
  lastHand: HandSummary | null;
  /** Same object as `lastHand` — design-checkpoint alias. */
  lastHandSummary: HandSummary | null;
}
