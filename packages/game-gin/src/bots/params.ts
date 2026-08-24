import type { Rng, SeatId } from '@parlour/engine';
import type { GinState } from '../state';

/** Bot tuning shared by every tier. */
export interface GinBotParams {
  /** deadwood ceiling the bot knocks at (lower = more patient) */
  knockAt: number;
  /** survival bar for Monte-Carlo knock timing (null = no MC) */
  knockProb: number | null;
  /** flat deadwood credit granted to the defender's unseen potential */
  opponentUplift: number;
  /** how strongly pickups feed inference (0 ignores them) */
  memory: number;
  /** chase gin when close instead of banking a knock */
  chaseGin: boolean;
}

export interface BrainContext {
  view: GinState;
  seat: SeatId;
  params: GinBotParams;
  rng: Rng;
}

export const EASY_PARAMS: GinBotParams = {
  knockAt: 5,
  knockProb: null,
  opponentUplift: 0,
  memory: 0,
  chaseGin: false,
};

export const MEDIUM_PARAMS: GinBotParams = {
  knockAt: 8,
  knockProb: null,
  opponentUplift: 0,
  memory: 0.7,
  chaseGin: true,
};

export const HARD_PARAMS: GinBotParams = {
  knockAt: 10,
  knockProb: 0.55,
  opponentUplift: 1,
  memory: 1.4,
  chaseGin: true,
};
