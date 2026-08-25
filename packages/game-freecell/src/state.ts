import type { CardId } from '@parlour/engine';
import type { FreecellRules } from './config';
import type { FreecellSuit } from './cards';

export type FreecellStage = 'playing' | 'won';

export type FreecellFoundations = Record<FreecellSuit, CardId[]>;

export interface FreecellState {
  rules: FreecellRules;
  stage: FreecellStage;
  /** Visual top-to-bottom; the last card is the exposed top. */
  tableau: CardId[][];
  /** One card each; length is rules.freeCells. */
  cells: (CardId | null)[];
  /** Ace-to-King; top card is the last entry. */
  foundations: FreecellFoundations;
  /** Accepted player actions. */
  moves: number;
}

/** Public surface: every card is already face-up; still a structural copy. */
export interface FreecellPlayerView {
  rules: FreecellRules;
  stage: FreecellStage;
  tableau: CardId[][];
  cells: (CardId | null)[];
  foundations: FreecellFoundations;
  moves: number;
}

export type TableauMovePayload = { from: number; card: CardId; to: number };
export type TableauSourcePayload = { from: number };
export type TableauTargetPayload = { to: number };
export type CellSourcePayload = { from: number };
export type CellTargetPayload = { to: number };
export type CellToTableauPayload = { from: number; to: number };
export type CellToCellPayload = { from: number; to: number };
export type TableauToCellPayload = { from: number; to: number };
export type FoundationToTableauPayload = { suit: FreecellSuit; to: number };
