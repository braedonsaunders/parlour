import { stableCardOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';

export const DECK = stdDeck();

/** Hold'em deals two cards down to each seat and five to the board. */
export const HOLE_CARDS = 2;
export const BOARD_CARDS = 5;

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

/**
 * Poker rank, ace high: 2 … 10 < J < Q < K < A.
 *
 * The std deck prints an ace as rank 1. Every comparison in poker except the
 * wheel straight wants it at 14, so the wheel is handled where straights are
 * detected rather than by carrying two rank scales around.
 */
export function rankOf(card: CardId): number {
  const printed = DECK.faces[card]?.rank;
  if (typeof printed !== 'number') return -1;
  return printed === 1 ? 14 : printed;
}

export function suitOf(card: CardId): Suit | null {
  const suit = DECK.faces[card]?.suit;
  return SUITS.includes(suit as Suit) ? (suit as Suit) : null;
}

/** 'A' 'K' 'Q' 'J' 'T' '9' … '2' — the way a rank is spoken at a table. */
export function rankSymbol(rank: number): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    case 10:
      return 'T';
    default:
      return String(rank);
  }
}

const RANK_NAMES: Readonly<Record<number, string>> = {
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'jack',
  12: 'queen',
  13: 'king',
  14: 'ace',
};

export function rankName(rank: number): string {
  return RANK_NAMES[rank] ?? String(rank);
}

/** Plural used when a hand is named: "queens over threes". */
export function rankPlural(rank: number): string {
  const name = rankName(rank);
  return name === 'six' ? 'sixes' : `${name}s`;
}

/** Locale-independent lexical order on card ids — never `localeCompare`. */
export function compareCardIds(left: CardId, right: CardId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Ace-high rank descending, then explicit id order so ties are stable. */
export function byRankDesc(left: CardId, right: CardId): number {
  return rankOf(right) - rankOf(left) || compareCardIds(left, right);
}

/**
 * A hold'em hand is two cards. Pairs and suited cards read faster side by side,
 * so the high card leads and a suited partner stays next to it. Pure
 * presentation — the authoritative hole zone is never reordered.
 */
export const orderPokerHand: HandOrder = (cards) => stableCardOrder(cards, byRankDesc);

/** Every card in the deck, ordered — the source a shuffle draws from. */
export function fullDeck(): CardId[] {
  return [...DECK.cardIds];
}
