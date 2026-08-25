import { keepHandOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const GOLF_SEATS = 1;
export const TABLEAU_COLUMNS = 7;
export const TABLEAU_ROWS = 5;
export const TABLEAU_SIZE = TABLEAU_COLUMNS * TABLEAU_ROWS;
export const DECK = stdDeck();

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type GolfSuit = (typeof SUITS)[number];

export function suitOfCard(card: CardId): GolfSuit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as GolfSuit) ? (suit as GolfSuit) : null;
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

/**
 * Classic Golf plays a card one rank away from the hole. Fairway wraps Ace
 * and King so a long chain can keep running.
 */
export function canPlayOnHole(card: CardId, hole: CardId, wrap: boolean): boolean {
  const from = rankOfCard(card);
  const to = rankOfCard(hole);
  if (from < 1 || to < 1) return false;
  if (Math.abs(from - to) === 1) return true;
  return wrap && ((from === 1 && to === 13) || (from === 13 && to === 1));
}

/** Tableau order is the deal; never presentation-sort it. */
export const orderGolfHand: HandOrder = keepHandOrder;
