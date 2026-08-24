import { keepHandOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const KLONDIKE_SEATS = 1;
export const TABLEAU_COLUMNS = 7;
export const FOUNDATION_SIZE = 13;
export const DECK = stdDeck();

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type KlondikeSuit = (typeof SUITS)[number];

export function suitOfCard(card: CardId): KlondikeSuit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as KlondikeSuit) ? (suit as KlondikeSuit) : null;
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

export function isKing(card: CardId): boolean {
  return rankOfCard(card) === 13;
}

export function isPackedRun(cards: readonly CardId[]): boolean {
  for (let index = 1; index < cards.length; index++) {
    const above = cards[index - 1] as CardId;
    const below = cards[index] as CardId;
    if (rankOfCard(below) !== rankOfCard(above) - 1) return false;
    if (colorOfCard(below) === colorOfCard(above)) return false;
  }
  return cards.length > 0;
}

export function canPlaceOnTableau(card: CardId, target: CardId | null): boolean {
  if (target === null) return isKing(card);
  return rankOfCard(card) === rankOfCard(target) - 1 && colorOfCard(card) !== colorOfCard(target);
}

export function canPlaceOnFoundation(card: CardId, foundation: readonly CardId[]): boolean {
  const suit = suitOfCard(card);
  if (!suit) return false;
  const top = foundation.at(-1);
  if (!top) return rankOfCard(card) === 1;
  return suitOfCard(top) === suit && rankOfCard(card) === rankOfCard(top) + 1;
}

/** Tableau order is rules-significant; never presentation-sort it. */
export const orderKlondikeHand: HandOrder = keepHandOrder;
