import { stdDeck, type CardId } from '@parlour/engine';

const DECK = stdDeck();

/** A=1 … K=13 (aces are low only — Q-K-A is never a run). */
export function rankOf(card: CardId): number {
  const rank = DECK.faces[card]?.rank;
  if (typeof rank !== 'number') throw new Error(`unknown card id: ${card}`);
  return rank;
}

export function suitOf(card: CardId): string {
  const suit = DECK.faces[card]?.suit;
  if (suit === undefined) throw new Error(`unknown card id: ${card}`);
  return suit;
}

/** A counts 1, faces count 10, pips count face value. */
export function pipValue(card: CardId): number {
  return Math.min(rankOf(card), 10);
}
