import {
  isVeilHandle,
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

/**
 * A card the table is holding but cannot read.
 *
 * Under Veil a hand is a row of handles until its owner opens it, and every
 * reader below — suit, rank, value, sort order — would otherwise throw on one.
 * A rule that reaches for a hidden card's suit needs a definite "no", not a
 * crash, so the handle is named here once and the readers all defer to it.
 */
export function isHiddenCard(card: CardId): boolean {
  return isVeilHandle(card);
}

export function hasHiddenCard(cards: readonly CardId[]): boolean {
  return cards.some(isHiddenCard);
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
  return !isHiddenCard(card) && rankOf(card) === WILD_RANK;
}

/**
 * What a card costs the player still holding it when someone else goes out.
 * The traditional tariff: an eight is fifty, any ten or court card is ten, an
 * ace is one, and everything else is worth its pips.
 */
export function cardValue(card: CardId): number {
  // A closed hand has no score yet; the round waits for its owner to open it
  // rather than guessing, so a handle is worth nothing until it is a card.
  if (isHiddenCard(card)) return 0;
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
    // Handles sort to the back and never compare by face: under Veil a hand is
    // handles until it opens, and asking one for its suit would throw.
    const leftHidden = isHiddenCard(left);
    const rightHidden = isHiddenCard(right);
    if (leftHidden || rightHidden) return Number(leftHidden) - Number(rightHidden);
    const leftWild = isWild(left);
    const rightWild = isWild(right);
    if (leftWild !== rightWild) return leftWild ? -1 : 1;
    const suitDiff = SUIT_ORDER[suitOf(left)] - SUIT_ORDER[suitOf(right)];
    if (suitDiff !== 0) return suitDiff;
    return rankOf(left) - rankOf(right);
  });
