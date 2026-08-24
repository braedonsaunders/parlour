import {
  stableCardOrder,
  type CardId,
  type CardFace,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';
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

const HEARTS_HAND_SUIT_ORDER: Readonly<Record<string, number>> = {
  [SUIT_CLUBS]: 0,
  [SUIT_DIAMONDS]: 1,
  [SUIT_SPADES]: 2,
  [SUIT_HEARTS]: 3,
};

/** Groups follow-suit choices and leaves special scoring cards at their suit edge. */
export const orderHeartsHand: HandOrder = (cards, context) =>
  stableCardOrder(cards, (left, right) => {
    const aSuit = suitOfCard(left);
    const bSuit = suitOfCard(right);
    if (aSuit === null) return bSuit === null ? 0 : 1;
    if (bSuit === null) return -1;
    const suitDiff = (HEARTS_HAND_SUIT_ORDER[aSuit] ?? 99) - (HEARTS_HAND_SUIT_ORDER[bSuit] ?? 99);
    if (suitDiff !== 0) return suitDiff;
    const specialKey = (card: CardId) =>
      card === QUEEN_SPADES || (context.jackDiamonds === true && card === JACK_DIAMONDS) ? 1 : 0;
    const specialDiff = specialKey(left) - specialKey(right);
    if (specialDiff !== 0) return specialDiff;
    const rankKey = (card: CardId) => (rankOfCard(card) === 1 ? 14 : rankOfCard(card));
    return rankKey(left) - rankKey(right) || left.localeCompare(right);
  });
