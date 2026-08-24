import type { CardId, CardFace, DeckDef } from '@parlour/engine';
import type { TrickRules } from '@parlour/tricks';

/**
 * Std-deck facts for Hearts. Every lookup tolerates Veil handles by returning
 * a definite "unknown" rather than throwing — a handle has no face yet.
 */

export const SUIT_CLUBS = 'clubs';
export const SUIT_HEARTS = 'hearts';
export const SUIT_SPADES = 'spades';
export const SUIT_DIAMONDS = 'diamonds';

export const TWO_CLUBS: CardId = 'C2';
export const QUEEN_SPADES: CardId = 'S12';
export const JACK_DIAMONDS: CardId = 'D11';

export function isRealCard(card: string): boolean {
  return !card.startsWith('v#');
}

export function suitOfCard(card: CardId): string | null {
  if (!isRealCard(card)) return null;
  switch (card[0]) {
    case 'C':
      return SUIT_CLUBS;
    case 'H':
      return SUIT_HEARTS;
    case 'S':
      return SUIT_SPADES;
    case 'D':
      return SUIT_DIAMONDS;
    default:
      return null;
  }
}

export function rankOfCard(card: CardId): number {
  if (!isRealCard(card)) return -1;
  const rank = Number.parseInt(card.slice(1), 10);
  return Number.isFinite(rank) ? rank : -1;
}

export function isHeart(card: CardId): boolean {
  return suitOfCard(card) === SUIT_HEARTS;
}

export function isPenaltyCard(card: CardId, jackDiamonds: boolean): boolean {
  void jackDiamonds; // J♦ is a bonus card, never a penalty card
  return isHeart(card) || card === QUEEN_SPADES;
}

/** Points a taken card contributes: hearts = 1, Q♠ = 13, J♦ = −10 (toggle). */
export function cardPoints(card: CardId, jackDiamonds: boolean): number {
  if (isHeart(card)) return 1;
  if (card === QUEEN_SPADES) return 13;
  if (jackDiamonds && card === JACK_DIAMONDS) return -10;
  return 0;
}

export function trickPoints(cards: readonly CardId[], jackDiamonds: boolean): number {
  return cards.reduce((sum, card) => sum + cardPoints(card, jackDiamonds), 0);
}

/** Trick rules for Hearts: follow suit, no trump, ace-high ranks. */
export function heartsTrickRules(deck?: DeckDef): TrickRules {
  void deck;
  return { suitOf: suitOfCard, rankOf: rankOfCard };
}

export function facesOf(deck: DeckDef): Readonly<Record<CardId, CardFace>> {
  return deck.faces;
}
