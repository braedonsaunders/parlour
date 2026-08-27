import type { CardId } from '@parlour/engine';
import type { TripeaksRules } from './config';

export type TripeaksStage = 'playing' | 'won' | 'holed';

export interface TripeaksState {
  rules: TripeaksRules;
  stage: TripeaksStage;
  /** 18 tableau slots, index by the locked peaks layout. Null once played. */
  tableau: (CardId | null)[];
  /** Remaining face-down stock. Top card is the last entry. */
  stock: CardId[];
  /** The hole. Top card is the last entry and is the only legal target. */
  hole: CardId[];
  /** Accepted player actions: plays, flips, and the recycle. */
  moves: number;
  /** Successful hole-to-stock recycles (0 or 1). */
  recycles: number;
}

export type HiddenTripeaksCard = '??';

/** Public surface: only the stock is hidden. */
export interface TripeaksPlayerView {
  rules: TripeaksRules;
  stage: TripeaksStage;
  tableau: (CardId | null)[];
  stock: HiddenTripeaksCard[];
  hole: CardId[];
  moves: number;
  recycles: number;
}

export type TableauPlayPayload = { from: number };
