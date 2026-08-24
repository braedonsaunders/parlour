import { stableCardOrder, stdDeck, type CardId, type HandOrder } from '@parlour/engine';
import type { BlitzConfig } from './config';

const DECK = stdDeck();

/** A=11, K/Q/J=10, pips face value (spec §5.1). */
export function pipValue(card: CardId): number {
  const rank = DECK.faces[card]?.rank;
  if (typeof rank !== 'number') throw new Error(`unknown card id: ${card}`);
  if (rank === 1) return 11;
  return Math.min(rank, 10);
}

export function suitOf(card: CardId): string {
  const suit = DECK.faces[card]?.suit;
  if (suit === undefined) throw new Error(`unknown card id: ${card}`);
  return suit;
}

export function suitSums(hand: readonly CardId[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const card of hand) {
    const suit = suitOf(card);
    sums.set(suit, (sums.get(suit) ?? 0) + pipValue(card));
  }
  return sums;
}

export function bestSuit(hand: readonly CardId[]): { suit: string; value: number } | null {
  let best: { suit: string; value: number } | null = null;
  for (const [suit, value] of suitSums(hand)) {
    if (!best || value > best.value) best = { suit, value };
  }
  return best;
}

export function hasThreeOfAKind(hand: readonly CardId[]): boolean {
  if (hand.length < 3) return false;
  const [a, b, c] = hand.map((card) => DECK.faces[card]?.rank);
  return a !== undefined && a === b && b === c;
}

export const BLITZ_VALUE = 31;

const SUIT_PRIORITY: Readonly<Record<string, number>> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

/**
 * Keeps a three-of-a-kind together when present; otherwise the suit carrying
 * the highest live total comes first, with its strongest cards first.
 */
export const orderBlitzHand: HandOrder = (cards) => {
  const rankCounts = new Map<number, number>();
  const suitTotals = new Map<string, number>();
  for (const card of cards) {
    const face = DECK.faces[card];
    if (!face || typeof face.rank !== 'number' || !face.suit) continue;
    rankCounts.set(face.rank, (rankCounts.get(face.rank) ?? 0) + 1);
    suitTotals.set(face.suit, (suitTotals.get(face.suit) ?? 0) + pipValue(card));
  }
  const tripleRank = [...rankCounts].find(([, count]) => count >= 3)?.[0] ?? null;
  const suits = [...suitTotals.keys()].sort(
    (left, right) =>
      (suitTotals.get(right) ?? 0) - (suitTotals.get(left) ?? 0) ||
      (SUIT_PRIORITY[left] ?? 99) - (SUIT_PRIORITY[right] ?? 99),
  );
  const suitPosition = new Map(suits.map((suit, index) => [suit, index]));

  return stableCardOrder(cards, (left, right) => {
    const a = DECK.faces[left];
    const b = DECK.faces[right];
    if (!a || typeof a.rank !== 'number' || !a.suit) return b ? 1 : 0;
    if (!b || typeof b.rank !== 'number' || !b.suit) return -1;
    if (tripleRank !== null) {
      const tripleDiff = Number(b.rank === tripleRank) - Number(a.rank === tripleRank);
      if (tripleDiff !== 0) return tripleDiff;
    }
    const suitDiff = (suitPosition.get(a.suit) ?? 99) - (suitPosition.get(b.suit) ?? 99);
    if (suitDiff !== 0) return suitDiff;
    const strength = (rank: number) => (rank === 1 ? 14 : rank);
    return strength(b.rank) - strength(a.rank) || left.localeCompare(right);
  });
};

/**
 * Hand value = max over suits of that suit's sum; three of a kind may count
 * 30.5 / 30 / nothing per house rules (spec §5.1–5.2).
 */
export function handValue(hand: readonly CardId[], config: BlitzConfig): number {
  const best = bestSuit(hand)?.value ?? 0;
  if (config.threeOfAKind !== 'off' && hasThreeOfAKind(hand)) {
    const tok = config.threeOfAKind === '30.5' ? 30.5 : 30;
    return Math.max(best, tok);
  }
  return best;
}

/**
 * Blitz = holding a suited exactly-31 (spec §5.1: "reaching exactly 31").
 * Transient four-card hands can sum higher than 31 mid-turn — that is not a
 * blitz. Three-of-a-kind never blitzes.
 */
export function isBlitz(hand: readonly CardId[]): boolean {
  return (bestSuit(hand)?.value ?? 0) === BLITZ_VALUE;
}
