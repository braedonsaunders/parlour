import {
  isVeilHandle,
  stableCardOrder,
  stdDeck,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

/** Palace is played with the plain 52-card deck — no jokers. */
export const PALACE_DECK: DeckDef = stdDeck();

/** The rank that resets the pile floor back to (almost) anything. */
export const RESET_RANK = 2;
/** The rank that burns the pile outright. */
export const BURN_RANK = 10;
/** The rank that is always playable and never changes the floor. */
export const BLIND_RANK = 8;
/** How many cards on top of the pile, of one rank, burn it. */
export const FOUR_KIND_COUNT = 4;

/**
 * Table-order rank of a card: 2 lowest, 3…10 as printed, J/Q/K/A climbing to
 * the top. `stdDeck` numbers ranks A=1…K=13; this remaps only the ace.
 */
export function orderOf(card: CardId): number {
  const raw = Number(card.slice(1));
  if (!Number.isInteger(raw) || raw < 1 || raw > 13) {
    throw new Error(`not a standard card id: ${card}`);
  }
  return raw === 1 ? 14 : raw;
}

/** Table-order rank, or null for an opaque Veil handle. */
export function tryOrder(card: CardId): number | null {
  return isVeilHandle(card) ? null : orderOf(card);
}

export function isPalaceCard(card: CardId): boolean {
  if (card.length < 2 || card.length > 3) return false;
  const suit = card.slice(0, 1);
  if (!'SHDC'.includes(suit)) return false;
  const rank = Number(card.slice(1));
  return Number.isInteger(rank) && rank >= 1 && rank <= 13;
}

/** True once every id in `cards` sits on the same table-order rank. */
export function isSameRank(cards: readonly CardId[]): boolean {
  if (cards.length === 0) return false;
  const rank = orderOf(cards[0]!);
  return cards.every((card) => orderOf(card) === rank);
}

const SUIT_PRIORITY: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };

/** Low-to-high table strength: 2 first, then 3…A. Handles sort to the back. */
export const orderPalaceHand: HandOrder = (cards) =>
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
