/**
 * Shared bot evaluation helpers for Palace.
 *
 * Every tier reads the same game state through the same primitives; the
 * difference is how aggressively each tier weights the numbers.
 */

import type { LegalMove, SeatId } from '@parlour/engine';
import { BLIND_RANK, BURN_RANK, RESET_RANK, tryOrder } from '../cards';
import { handOf, upOf } from '../round';
import type { PalaceState } from '../state';

export interface PlayCandidate {
  move: LegalMove;
  cards: readonly string[];
  rank: number;
  size: number;
}

export function playCandidates(legal: readonly LegalMove[]): PlayCandidate[] {
  const out: PlayCandidate[] = [];
  for (const move of legal) {
    if (move.id !== 'playCards') continue;
    const raw = (move.payload as { cards?: unknown } | undefined)?.cards;
    if (!Array.isArray(raw)) continue;
    const cards = raw.filter((card): card is string => typeof card === 'string');
    if (cards.length === 0) continue;
    const rank = tryOrder(cards[0] ?? '');
    if (rank === null) continue;
    out.push({ move, cards, rank, size: cards.length });
  }
  return out;
}

export function downCandidates(legal: readonly LegalMove[]): LegalMove[] {
  return legal.filter((move) => move.id === 'playDown');
}

export function pickupMove(legal: readonly LegalMove[]): LegalMove | null {
  return legal.find((move) => move.id === 'pickup') ?? null;
}

/** Lower is "cheaper to spend" — a bot leads with the lowest-cost rank first. */
export function specialCost(rank: number): number {
  if (rank === BURN_RANK) return 40; // save the ten for an escape
  if (rank === RESET_RANK) return 30; // a two is precious defensively
  if (rank === BLIND_RANK) return 10; // an eight is nearly free — it never sticks you
  return rank;
}

export function cheapest(candidates: readonly PlayCandidate[]): PlayCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => specialCost(a.rank) - specialCost(b.rank) || b.size - a.size,
  )[0]!;
}

/**
 * Puts the seat's strongest cards face up and its weakest into hand, up to
 * `keep` pairs — a face-up row you chose beats one the deal handed you.
 */
export function chooseSwapPairs(
  state: PalaceState,
  seat: SeatId,
  keep: number,
): { hand: string; up: string }[] {
  const rankedHand = [...handOf(state, seat)]
    .map((card) => ({ card, rank: tryOrder(card) }))
    .filter((entry): entry is { card: string; rank: number } => entry.rank !== null)
    .sort((a, b) => b.rank - a.rank);
  const rankedUp = [...upOf(state, seat)]
    .map((card) => ({ card, rank: tryOrder(card) }))
    .filter((entry): entry is { card: string; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank);
  const pairs: { hand: string; up: string }[] = [];
  for (let i = 0; i < Math.min(keep, rankedHand.length, rankedUp.length); i++) {
    const strong = rankedHand[i]!;
    const weak = rankedUp[i]!;
    if (strong.rank <= weak.rank) break;
    pairs.push({ hand: strong.card, up: weak.card });
  }
  return pairs;
}
