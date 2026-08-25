import type { CardId } from '@parlour/engine';
import type { GolfRules } from './config';

export type GolfStage = 'playing' | 'won' | 'holed';

export interface GolfState {
  rules: GolfRules;
  stage: GolfStage;
  /** Remaining face-down stock. Top card is the last entry. */
  stock: CardId[];
  /** The hole. Top card is the last entry and is the only legal target. */
  waste: CardId[];
  /** Seven columns, each a top-to-bottom stack. The last card is the foot. */
  tableau: CardId[][];
  /** Accepted player actions. Opening the hole is setup, not a move. */
  moves: number;
}

export type HiddenGolfCard = '??';

/** Public surface: only the stock is hidden. */
export interface GolfPlayerView {
  rules: GolfRules;
  stage: GolfStage;
  stock: HiddenGolfCard[];
  waste: CardId[];
  tableau: CardId[][];
  moves: number;
}

export type TableauPlayPayload = { from: number };
