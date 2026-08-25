import type { CardId } from '@parlour/engine';
import type { PyramidRules } from './config';

export type PyramidStage = 'playing' | 'won' | 'holed';

/** A live pyramid cell, or the top waste card. */
export type PyramidSource = { row: number; col: number } | 'waste';

export interface PyramidState {
  rules: PyramidRules;
  stage: PyramidStage;
  /** Seven rows; row r holds r+1 cells. Null is an empty slot. */
  pyramid: (CardId | null)[][];
  /** Top card is the last entry. */
  stock: CardId[];
  /** Top card is the last entry and is the only live waste card. */
  waste: CardId[];
  /** Accepted player actions. */
  moves: number;
  /** Successful waste-to-stock flips. */
  recycles: number;
}

export type HiddenPyramidCard = '??';

/** Public surface: only the stock is hidden. */
export interface PyramidPlayerView {
  rules: PyramidRules;
  stage: PyramidStage;
  pyramid: (CardId | null)[][];
  stock: HiddenPyramidCard[];
  waste: CardId[];
  moves: number;
  recycles: number;
}

export type PairPayload = { a: PyramidSource; b: PyramidSource };
export type RemovePayload = { from: PyramidSource };
