import {
  isVeilHandle,
  stableCardOrder,
  stdDeck,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

/** President is played with the plain 52-card deck — no jokers in v1. */
export const PRESIDENT_DECK: DeckDef = stdDeck();

/**
 * Table order of ranks: 3 low … K, A, and the 2 highest. `stdDeck` numbers
 * ranks A=1 … K=13, so the table order maps them onto 3…15.
 */
export function orderOf(card: CardId): number {
  const raw = Number(card.slice(1));
  if (!Number.isInteger(raw) || raw < 1 || raw > 13) {
    throw new Error(`not a standard card id: ${card}`);
  }
  if (raw === 1) return 14;
  if (raw === 2) return 15;
  return raw;
}

export const MIN_SET_SIZE = 1;
export const MAX_SET_SIZE = 4;
export const TWO_ORDER = 15;

/**
 * Table-order rank of a card, or null for an opaque Veil handle. Rules that
 * compare faces return a definite verdict instead of throwing on handles.
 */
export function tryOrder(card: CardId): number | null {
  return isVeilHandle(card) ? null : orderOf(card);
}

const SUIT_PRIORITY: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };

/** Low-to-high table strength: threes first, then through aces and twos. */
export const orderPresidentHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const a = tryOrder(left);
    const b = tryOrder(right);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return (
      a - b ||
      (SUIT_PRIORITY[left[0] ?? ''] ?? 99) - (SUIT_PRIORITY[right[0] ?? ''] ?? 99) ||
      left.localeCompare(right)
    );
  });

/** Total order used only to pick the ceremonial lowest card: 3♣ < 3♦ < 3♥ < 3♠. */
export function ceremonialLow(a: CardId, b: CardId): CardId {
  const orderDiff = orderOf(a) - orderOf(b);
  if (orderDiff !== 0) return orderDiff < 0 ? a : b;
  const pa = SUIT_PRIORITY[a.slice(0, 1)] ?? 0;
  const pb = SUIT_PRIORITY[b.slice(0, 1)] ?? 0;
  return pa <= pb ? a : b;
}

export function isPresidentCard(card: CardId): boolean {
  if (card.length < 2 || card.length > 3) return false;
  const suit = card.slice(0, 1);
  if (!(suit in SUIT_PRIORITY)) return false;
  const rank = Number(card.slice(1));
  return Number.isInteger(rank) && rank >= 1 && rank <= 13;
}

/** True when every id in `cards` sits on the same table-order rank. */
export function isSameRank(cards: readonly CardId[]): boolean {
  if (cards.length === 0) return false;
  const rank = orderOf(cards[0]!);
  return cards.every((card) => orderOf(card) === rank);
}
