import { keepHandOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const FREECELL_SEATS = 1;
export const TABLEAU_COLUMNS = 8;
export const FOUNDATION_SIZE = 13;
export const CLASSIC_CELLS = 4;
export const RELAXED_CELLS = 6;
export const COLUMN_LENGTHS = [7, 7, 7, 7, 6, 6, 6, 6] as const;
export const DECK = stdDeck();

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type FreecellSuit = (typeof SUITS)[number];

export function suitOfCard(card: CardId): FreecellSuit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as FreecellSuit) ? (suit as FreecellSuit) : null;
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

const RANK_NAMES = [
  '',
  'Ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'Jack',
  'Queen',
  'King',
] as const;

/** Spoken face, e.g. "King of diamonds". Unknown ids stay as the raw card. */
export function nameOfCard(card: CardId): string {
  const rank = rankOfCard(card);
  const suit = suitOfCard(card);
  const rankName = rank >= 1 && rank <= 13 ? RANK_NAMES[rank] : null;
  return rankName && suit ? `${rankName} of ${suit}` : card;
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

/** Empty tableau columns accept any card, not only Kings. */
export function canPlaceOnTableau(card: CardId, target: CardId | null): boolean {
  if (target === null) return true;
  return rankOfCard(card) === rankOfCard(target) - 1 && colorOfCard(card) !== colorOfCard(target);
}

export function canPlaceOnFoundation(card: CardId, foundation: readonly CardId[]): boolean {
  const suit = suitOfCard(card);
  if (!suit) return false;
  const top = foundation.at(-1);
  if (!top) return rankOfCard(card) === 1;
  return suitOfCard(top) === suit && rankOfCard(card) === rankOfCard(top) + 1;
}

/**
 * Microsoft supermove: (emptyFreeCells + 1) * 2^emptyTableauColumns.
 * Callers must already exclude an empty destination from emptyTableauColumns.
 */
export function maxMovable(emptyFreeCells: number, emptyTableauColumns: number): number {
  let power = 1;
  for (let index = 0; index < emptyTableauColumns; index++) power *= 2;
  return (emptyFreeCells + 1) * power;
}

export function supermoveLimit(
  cells: readonly (CardId | null)[],
  tableau: readonly (readonly CardId[])[],
  destEmpty: boolean,
): number {
  const emptyFreeCells = cells.filter((cell) => cell === null).length;
  const emptyTableau = tableau.filter((column) => column.length === 0).length;
  const helpers = destEmpty ? Math.max(0, emptyTableau - 1) : emptyTableau;
  return maxMovable(emptyFreeCells, helpers);
}

/** Tableau order is rules-significant; never presentation-sort it. */
export const orderFreecellHand: HandOrder = keepHandOrder;
