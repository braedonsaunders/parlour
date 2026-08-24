import type { CardId, SeatId } from '@parlour/engine';
import type { ScopaRules } from './config';

export type ScopaStage = 'playing' | 'round-over';

export const AWARD_KINDS = [
  'carte',
  'denari',
  'settebello',
  'primiera',
  'scope',
  'napola',
  're-denari',
] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

/** One scored line on the round breakdown, e.g. denari → team 0 → +1. */
export interface Award {
  kind: AwardKind;
  /** score-owner index (team at partnership sizes, else the seat) */
  owner: number;
  points: number;
}

export interface RoundSummary {
  roundNo: number;
  dealer: SeatId;
  /** captured card count per seat */
  cardsBySeat: readonly number[];
  /** scope earned per seat during play */
  scopeBySeat: readonly number[];
  awards: readonly Award[];
  /** points added per score-owner */
  deltasByOwner: readonly number[];
  scoresAfter: readonly number[];
  /** seat that captured the settebello, when someone did */
  settebelloSeat: SeatId | null;
  /** seat that captured the King of coins under `reDenari` */
  reDenariSeat: SeatId | null;
}

/**
 * One continuous match of rounds. Scores live here (Spades-style) so a table
 * snapshot and the match can never diverge; every zone is per-seat while
 * scores are per-owner (team or individual — see `ownerOf`).
 */
export interface ScopaState {
  rules: ScopaRules;
  seats: number;
  /** 1-based round counter */
  roundNo: number;
  dealer: SeatId;
  /** hidden hands, one slot per seat */
  hands: CardId[][];
  /** undealt stock — empty in Scopone after the opening deal */
  stock: CardId[];
  /** face-up cards waiting to be captured or swept */
  table: CardId[];
  /** captured piles stay public in Scopa: everyone saw what was taken */
  captures: CardId[][];
  /** scope per seat, as earned during play */
  scope: number[];
  /** last seat that captured anything; sweeps the table at round end */
  lastCapturer: SeatId | null;
  stage: ScopaStage;
  turn: SeatId;
  scores: number[];
  /** this round's result while `stage === 'round-over'`; cleared on next deal */
  summary: RoundSummary | null;
  /**
   * Last completed round. Survives the auto-advance into the next deal so the
   * web can still render the score breakdown.
   */
  lastRound: RoundSummary | null;
}
