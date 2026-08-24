import {
  stableCardOrder,
  stdDeck,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

/** Suit letters as `stdDeck` writes them: `S12` is the queen of spades. */
export const EIGHTS_SUITS = ['S', 'H', 'D', 'C'] as const;

export type EightsSuit = (typeof EIGHTS_SUITS)[number];

export const EIGHTS_SUIT_NAMES: Readonly<Record<EightsSuit, string>> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

export const EIGHTS_SUIT_GLYPHS: Readonly<Record<EightsSuit, string>> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

/** The one card that always plays, and names the suit that follows it. */
export const WILD_RANK = 8;
/** Twos hit the next seat for two, when the table deals them in. */
export const DRAW_TWO_RANK = 2;
/** Queens step over the next seat. */
export const SKIP_RANK = 12;
/** Aces turn the table around — and act as a skip head-to-head. */
export const REVERSE_RANK = 1;

/** Crazy Eights is played from one ordinary pack. */
export const eightsDeck: DeckDef = stdDeck();

export function isEightsCard(card: CardId): boolean {
  return Object.hasOwn(eightsDeck.faces, card);
}

export function suitOf(card: CardId): EightsSuit {
  const suit = card.slice(0, 1);
  if (!isEightsSuit(suit)) throw new Error(`unknown eights card: ${card}`);
  return suit;
}

export function rankOf(card: CardId): number {
  const rank = Number.parseInt(card.slice(1), 10);
  if (!Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new Error(`unknown eights card: ${card}`);
  }
  return rank;
}

export function isEightsSuit(value: unknown): value is EightsSuit {
  return EIGHTS_SUITS.includes(value as EightsSuit);
}

export function isWild(card: CardId): boolean {
  return rankOf(card) === WILD_RANK;
}

/**
 * What a card costs the player still holding it when someone else goes out.
 * The traditional tariff: an eight is fifty, any ten or court card is ten, an
 * ace is one, and everything else is worth its pips.
 */
export function cardValue(card: CardId): number {
  const rank = rankOf(card);
  if (rank === WILD_RANK) return 50;
  if (rank >= 10) return 10;
  return rank;
}

export function handValue(cards: readonly CardId[]): number {
  return cards.reduce((total, card) => total + cardValue(card), 0);
}

const SUIT_ORDER: Readonly<Record<EightsSuit, number>> = { S: 1, H: 2, D: 3, C: 4 };

/**
 * Eights lead, because they are the only cards that always play; the rest sit
 * in suit blocks, low to high, so a hand reads as the choices it offers.
 */
export const orderEightsHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const leftWild = isWild(left);
    const rightWild = isWild(right);
    if (leftWild !== rightWild) return leftWild ? -1 : 1;
    const suitDiff = SUIT_ORDER[suitOf(left)] - SUIT_ORDER[suitOf(right)];
    if (suitDiff !== 0) return suitDiff;
    return rankOf(left) - rankOf(right);
  });
