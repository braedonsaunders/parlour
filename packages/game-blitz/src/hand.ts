import { stdDeck, type CardId } from '@parlour/engine';
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
