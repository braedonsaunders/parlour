import type { Rng } from '@parlour/engine';
import {
  EUCHRE_SUIT_NAMES,
  EUCHRE_SUITS,
  effectiveSuit,
  isLeftBower,
  isRightBower,
  rankOf,
  suitLetterOf,
  trickStrength,
  type EuchreSuit,
} from '../deck';

/**
 * Hand valuation shared by every tier. Weights: right bower dominates, the
 * left bower is nearly as good, bare aces pull their weight, low trump mostly
 * means "you will be outdrawn".
 */
export function cardWeight(card: string, trump: EuchreSuit): number {
  if (isRightBower(card, trump)) return 4.5;
  if (isLeftBower(card, trump)) return 3.75;
  const suit = suitLetterOf(card);
  const rank = rankOf(card);
  if (suit === null || rank === null) return 0;
  if (suit === trump) {
    switch (rank) {
      case 1:
        return 2.25;
      case 13:
        return 1.4;
      case 12:
        return 1.1;
      default:
        return 0.55;
    }
  }
  return rank === 1 ? 1.2 : 0;
}

export function handStrength(hand: readonly string[], trump: EuchreSuit): number {
  let score = 0;
  for (const card of hand) score += cardWeight(card, trump);
  return score;
}

/** Effective-trump count — the left bower counts, exactly like following rules. */
export function trumpCount(hand: readonly string[], trump: EuchreSuit): number {
  return hand.filter((card) => effectiveSuit(card, trump) === trump).length;
}

/** Suits held, by nominal letter — voids drive discard and lead choices. */
export function suitCounts(hand: readonly string[]): Record<EuchreSuit, number> {
  const counts = { S: 0, H: 0, D: 0, C: 0 } as Record<EuchreSuit, number>;
  for (const card of hand) {
    const suit = suitLetterOf(card);
    if (suit) counts[suit] += 1;
  }
  return counts;
}

/** How badly this hand wants `trump` named in round two. */
export function bestCallCandidate(
  hand: readonly string[],
  allowed: readonly EuchreSuit[],
): { suit: EuchreSuit; strength: number; count: number } | null {
  let best: { suit: EuchreSuit; strength: number; count: number } | null = null;
  for (const suit of allowed) {
    const strength = handStrength(hand, suit);
    const count = trumpCount(hand, suit);
    if (!best || strength > best.strength || (strength === best.strength && count > best.count)) {
      best = { suit, strength, count };
    }
  }
  return best;
}

/** Cheap-to-keep ordering: junk first, bowers and aces buried last. */
export function discardDesirability(card: string, trump: EuchreSuit | null): number {
  const rank = rankOf(card);
  if (rank === null || !trump) return -1;
  if (isRightBower(card, trump)) return 100;
  if (isLeftBower(card, trump)) return 90;
  const suit = suitLetterOf(card);
  if (suit !== null && effectiveSuit(card, trump) === trump)
    return 20 + (rank === 1 ? 6 : rank >= 9 ? rank - 9 : 0);
  return rank === 1 ? 15 : rank === 13 ? 10 : rank === 12 ? 7 : rank === 11 ? 5 : rank - 9;
}

/** Lowest-value card to throw away on a trick you are not contesting. */
export function weakestCard(hand: readonly string[], trump: EuchreSuit): string {
  return [...hand].sort(
    (a, b) => discardDesirability(a, trump) - discardDesirability(b, trump),
  )[0] as string;
}

/** Seat currently taking the trick, or null before any play. */
export function currentTrickWinner(
  trick: readonly { seat: number; card: string }[],
  trump: EuchreSuit,
): number | null {
  if (trick.length === 0) return null;
  const led = effectiveSuit(trick[0]!.card, trump);
  if (!led) return null;
  let best = trick[0]!;
  for (const play of trick.slice(1)) {
    const challenger = trickStrength(play.card, trump, led);
    const champion = trickStrength(best.card, trump, led);
    if (challenger !== null && challenger > (champion ?? -1)) best = play;
  }
  return best.seat;
}

/** Cheapest card that would take the trick right now, or null. */
export function cheapestWinner(
  options: readonly string[],
  trump: EuchreSuit,
  led: EuchreSuit,
  beatenBy: number,
): string | null {
  let best: string | null = null;
  let bestStrength = Number.POSITIVE_INFINITY;
  for (const card of options) {
    const strength = trickStrength(card, trump, led);
    if (strength === null || strength <= beatenBy) continue;
    if (strength < bestStrength) {
      best = card;
      bestStrength = strength;
    }
  }
  return best;
}

/** Lowest card that still follows the led suit. */
export function lowestFollower(
  options: readonly string[],
  trump: EuchreSuit,
  led: EuchreSuit,
): string | null {
  let best: string | null = null;
  let bestStrength = Number.POSITIVE_INFINITY;
  for (const card of options) {
    const strength = trickStrength(card, trump, led);
    if (strength === null || strength >= bestStrength) continue;
    best = card;
    bestStrength = strength;
  }
  return best;
}

/** A side-suit ace worth leading early, preferring singletons. */
export function singletonAceLead(hand: readonly string[], trump: EuchreSuit): string | null {
  const counts = suitCounts(hand);
  let best: string | null = null;
  let bestCount = 99;
  for (const card of hand) {
    const suit = suitLetterOf(card);
    if (!suit || suit === trump) continue;
    if (rankOf(card) !== 1) continue;
    if (counts[suit] < bestCount) {
      best = card;
      bestCount = counts[suit];
    }
  }
  return best;
}

/** Deterministic persona flavour: jitter thresholds ±amount without Math.random. */
export function jitter(base: number, amount: number, rng: Rng): number {
  if (amount === 0) return base;
  return base + (rng.float() * 2 - 1) * amount;
}

export const ALL_SUITS = EUCHRE_SUITS;
export { EUCHRE_SUIT_NAMES };
