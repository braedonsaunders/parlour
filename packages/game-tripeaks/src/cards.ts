import { keepHandOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const TRIPEAKS_SEATS = 1;
export const TABLEAU_SIZE = 18;
export const STOCK_SIZE = 33;
export const DECK = stdDeck();

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type TripeaksSuit = (typeof SUITS)[number];

/**
 * Parent → children indices for the three peaks (locked layout):
 * ```
 *       0           1           2
 *     3   4       5   6       7   8
 *   9  10  11  12  13  14  15  16  17
 * ```
 * The 9-card base (9–17) has no children and is free from the deal.
 */
export const TABLEAU_CHILDREN: readonly (readonly number[])[] = [
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
  [10, 11],
  [12, 13],
  [13, 14],
  [15, 16],
  [16, 17],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
  [],
];

export function emptyTableau(): (CardId | null)[] {
  return Array.from({ length: TABLEAU_SIZE }, () => null);
}

export function suitOfCard(card: CardId): TripeaksSuit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as TripeaksSuit) ? (suit as TripeaksSuit) : null;
}

/** Printed rank: Ace=1 through King=13. */
export function rankOfCard(card: CardId): number {
  const rank = DECK.faces[card]?.rank;
  return typeof rank === 'number' ? rank : -1;
}

export function colorOfCard(card: CardId): 'red' | 'black' | null {
  const color = DECK.faces[card]?.color;
  return color === 'red' || color === 'black' ? color : null;
}

export function validIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < TABLEAU_SIZE;
}

/** A tableau card is free when it is present and both of its children (if any) are gone. */
export function isFree(tableau: readonly (CardId | null)[], index: number): boolean {
  if (!tableau[index]) return false;
  const children = TABLEAU_CHILDREN[index] ?? [];
  return children.every((child) => tableau[child] === null);
}

/**
 * TriPeaks plays a card one rank away from the hole. Relaxed wraps Ace
 * and King so a chain can keep running.
 */
export function canPlayOnHole(card: CardId, hole: CardId, wrap: boolean): boolean {
  const from = rankOfCard(card);
  const to = rankOfCard(hole);
  if (from < 1 || to < 1) return false;
  if (Math.abs(from - to) === 1) return true;
  return wrap && ((from === 1 && to === 13) || (from === 13 && to === 1));
}

/** Tableau order is the deal; never presentation-sort it. */
export const orderTripeaksHand: HandOrder = keepHandOrder;
