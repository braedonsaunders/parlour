import { keepHandOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const PYRAMID_SEATS = 1;
export const PYRAMID_ROWS = 7;
export const PYRAMID_SIZE = 28;
export const STOCK_SIZE = 24;
export const DECK = stdDeck();

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type PyramidSuit = (typeof SUITS)[number];

export function emptyPyramid(): (CardId | null)[][] {
  return Array.from({ length: PYRAMID_ROWS }, (_, row) =>
    Array.from({ length: row + 1 }, () => null),
  );
}

export function clonePyramid(
  pyramid: readonly (readonly (CardId | null)[])[],
): (CardId | null)[][] {
  return pyramid.map((row) => row.slice());
}

export function suitOfCard(card: CardId): PyramidSuit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as PyramidSuit) ? (suit as PyramidSuit) : null;
}

/** Printed rank: Ace=1 through King=13. */
export function rankValue(card: CardId): number {
  const rank = DECK.faces[card]?.rank;
  return typeof rank === 'number' ? rank : -1;
}

export function colorOfCard(card: CardId): 'red' | 'black' | null {
  const color = DECK.faces[card]?.color;
  return color === 'red' || color === 'black' ? color : null;
}

export function isKing(card: CardId): boolean {
  return rankValue(card) === 13;
}

export function occupyCount(pyramid: readonly (readonly (string | null)[])[]): number {
  let count = 0;
  for (const row of pyramid) {
    for (const card of row) {
      if (card) count += 1;
    }
  }
  return count;
}

/**
 * A card is free when it is present and both cards that cover it are gone.
 * The last row has no covers.
 */
export function isFree(
  pyramid: readonly (readonly (string | null)[])[],
  row: number,
  col: number,
): boolean {
  if (!pyramid[row]?.[col]) return false;
  if (row >= PYRAMID_ROWS - 1) return true;
  return pyramid[row + 1]?.[col] === null && pyramid[row + 1]?.[col + 1] === null;
}

export function validCell(row: unknown, col: unknown): row is number {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    Number(row) >= 0 &&
    Number(row) < PYRAMID_ROWS &&
    Number(col) >= 0 &&
    Number(col) <= Number(row)
  );
}

/** Pyramid order is the deal; never presentation-sort it. */
export const orderPyramidHand: HandOrder = keepHandOrder;
