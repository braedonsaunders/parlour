import {
  pairedTeams,
  stableCardOrder,
  stdDeck,
  type CardId,
  type HandOrder,
  type SeatId,
} from '@parlour/engine';
import { faceRules, type TrickRules } from '@parlour/tricks';

export const SPADES_SEATS = 4;
export const HAND_SIZE = 13;
export const TRICKS_PER_HAND = HAND_SIZE;
export const DECK = stdDeck();

export const SUIT_CLUBS = 'clubs';
export const SUIT_DIAMONDS = 'diamonds';
export const SUIT_HEARTS = 'hearts';
export const SUIT_SPADES = 'spades';

export const TABLE_TEAMS = pairedTeams(SPADES_SEATS);

export function teamOf(seat: SeatId): 0 | 1 {
  return TABLE_TEAMS.teamOf(seat) as 0 | 1;
}

export function partnerOf(seat: SeatId): SeatId {
  return TABLE_TEAMS.partnerOf(seat) ?? seat;
}

export function seatsOf(team: 0 | 1): readonly SeatId[] {
  return TABLE_TEAMS.seatsOf(team);
}

export function suitOfCard(card: CardId): string | null {
  return DECK.faces[card]?.suit ?? null;
}

/** Printed rank from the std deck (A=1 … K=13), or −1 if unknown. */
export function printedRank(card: CardId): number {
  const rank = DECK.faces[card]?.rank;
  return typeof rank === 'number' ? rank : -1;
}

/** Ace-high trick rank: 2 < … < K < A. */
export function rankOfCard(card: CardId): number {
  const rank = printedRank(card);
  return rank === 1 ? 14 : rank;
}

export function isSpade(card: CardId): boolean {
  return suitOfCard(card) === SUIT_SPADES;
}

export function allSpades(cards: readonly CardId[]): boolean {
  return cards.length > 0 && cards.every((card) => isSpade(card));
}

/** Locale-independent lexical order on card ids (UTF-16 code units). */
export function compareCardIds(left: CardId, right: CardId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Ace-high rank, then explicit id order — never `localeCompare`. */
export function byRankThenId(left: CardId, right: CardId): number {
  return rankOfCard(left) - rankOfCard(right) || compareCardIds(left, right);
}

/**
 * Follow/winner rules: std-deck faces, ace-high, spades always trump.
 * Lead-before-broken is game-local (same split Hearts uses for hearts-broken).
 */
export function spadesTrickRules(): TrickRules {
  const faces = faceRules(DECK.faces);
  return {
    suitOf: faces.suitOf,
    rankOf: rankOfCard,
    trumpSuit: SUIT_SPADES,
  };
}

const HAND_SUIT_ORDER: Readonly<Record<string, number>> = {
  [SUIT_CLUBS]: 0,
  [SUIT_DIAMONDS]: 1,
  [SUIT_HEARTS]: 2,
  [SUIT_SPADES]: 3,
};

/** Clubs → diamonds → hearts → trump, ace-high inside each suit. */
export const orderSpadesHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const aSuit = suitOfCard(left);
    const bSuit = suitOfCard(right);
    if (aSuit === null) return bSuit === null ? 0 : 1;
    if (bSuit === null) return -1;
    const suitDiff = (HAND_SUIT_ORDER[aSuit] ?? 99) - (HAND_SUIT_ORDER[bSuit] ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return byRankThenId(left, right);
  });
