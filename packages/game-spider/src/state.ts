import type { CardId } from '@parlour/engine';
import type { SpiderRules } from './config';

export type SpiderStage = 'playing' | 'won';

/** Both arrays are visual top-to-bottom; their last card is exposed. */
export interface SpiderColumn {
  down: CardId[];
  up: CardId[];
}

export interface SpiderState {
  rules: SpiderRules;
  stage: SpiderStage;
  /** Top card is the last entry. Dealt in rows of ten. */
  stock: CardId[];
  tableau: SpiderColumn[];
  /** Eight completed King→Ace runs; top card is the last entry. */
  foundations: CardId[][];
  /** Accepted player actions. Suit clears do not add a second move. */
  moves: number;
}

export type HiddenSpiderCard = '??';

export interface SpiderPlayerColumn {
  down: HiddenSpiderCard[];
  up: CardId[];
}

/** Public surface: hidden zones can contain only opaque sentinels. */
export interface SpiderPlayerView {
  rules: SpiderRules;
  stage: SpiderStage;
  stock: HiddenSpiderCard[];
  tableau: SpiderPlayerColumn[];
  foundations: CardId[][];
  moves: number;
}

export type TableauMovePayload = { from: number; card: CardId; to: number };
