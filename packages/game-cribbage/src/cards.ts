import type { CardId } from '@parlour/engine';

/**
 * Cribbage card arithmetic over the standard 52-card deck ids (`S1` = A♠,
 * `S13` = K♠ — see @parlour/engine stdDeck). Rank order runs A-low (1) through
 * K (13); counting value is pip value with faces worth 10.
 */

export type SuitCode = 'S' | 'H' | 'D' | 'C';

const CARD_ID_PATTERN = /^[SHDC]([1-9]|1[0-3])$/;

function parseCard(card: CardId): { suit: SuitCode; rank: number } {
  const match = CARD_ID_PATTERN.exec(card);
  if (!match) throw new Error(`not a standard deck card id: ${card}`);
  return { suit: card[0] as SuitCode, rank: Number(match[1]) };
}

export function rankOf(card: CardId): number {
  return parseCard(card).rank;
}

export function suitOf(card: CardId): SuitCode {
  return parseCard(card).suit;
}

/** Counting value: A=1, pips face value, J/Q/K=10. */
export function cardValue(card: CardId): number {
  return Math.min(parseCard(card).rank, 10);
}

export function sumValues(cards: readonly CardId[]): number {
  return cards.reduce((total, card) => total + cardValue(card), 0);
}
