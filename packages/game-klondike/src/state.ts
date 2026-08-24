import type { CardId } from '@parlour/engine';
import type { KlondikeRules } from './config';
import type { KlondikeSuit } from './cards';

export type KlondikeStage = 'playing' | 'won';

/** Both arrays are visual top-to-bottom; their last card is exposed. */
export interface KlondikeColumn {
  down: CardId[];
  up: CardId[];
}

export type KlondikeFoundations = Record<KlondikeSuit, CardId[]>;

export interface KlondikeState {
  rules: KlondikeRules;
  stage: KlondikeStage;
  /** Top card is the last entry. */
  stock: CardId[];
  /** Top card is the last entry. */
  waste: CardId[];
  tableau: KlondikeColumn[];
  /** Ace-to-King; top card is the last entry. */
  foundations: KlondikeFoundations;
  /** Accepted player actions. Auto-flips do not add a second move. */
  moves: number;
  recycles: number;
}

export type HiddenKlondikeCard = '??';

export interface KlondikePlayerColumn {
  down: HiddenKlondikeCard[];
  up: CardId[];
}

/** Public surface: hidden zones can contain only opaque sentinels. */
export interface KlondikePlayerView {
  rules: KlondikeRules;
  stage: KlondikeStage;
  stock: HiddenKlondikeCard[];
  waste: CardId[];
  tableau: KlondikePlayerColumn[];
  foundations: KlondikeFoundations;
  moves: number;
  recycles: number;
}

export type TableauMovePayload = { from: number; card: CardId; to: number };
export type TableauTargetPayload = { to: number };
export type TableauSourcePayload = { from: number };
export type FoundationToTableauPayload = { suit: KlondikeSuit; to: number };
