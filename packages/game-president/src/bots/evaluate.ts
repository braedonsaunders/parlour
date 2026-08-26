/**
 * Shared bot evaluation helpers for President.
 *
 * Every tier reads the same game state through the same primitives; the
 * difference is how aggressively each tier weights the numbers.
 */

import type { LegalMove, Rng, SeatId } from '@parlour/engine';
import { TWO_ORDER, tryOrder } from '../deck';
import { activeSeats, giftCountFor, handOf, roleFor } from '../game';
import type { PresidentState } from '../state';

export interface Candidate {
  move: LegalMove;
  cards: readonly string[];
  rank: number;
  size: number;
}

export function setCandidates(legal: readonly LegalMove[]): Candidate[] {
  const out: Candidate[] = [];
  for (const move of legal) {
    if (move.id !== 'playSet') continue;
    const raw = (move.payload as { cards?: unknown }).cards;
    if (!Array.isArray(raw)) continue;
    const cards = raw.filter((card): card is string => typeof card === 'string');
    const rank = tryOrder(cards[0] ?? '');
    if (rank === null || cards.length === 0) continue;
    out.push({ move, cards, rank, size: cards.length });
  }
  return out;
}

export function groupCounts(cards: readonly string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const rank = tryOrder(card);
    if (rank === null) continue;
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

/** Playing part of a stronger held set wastes strength — charge for it. */
export function breakPenalty(counts: Map<number, number>, rank: number, size: number): number {
  const held = counts.get(rank) ?? 0;
  const excess = held - size;
  return excess > 0 ? excess * excess : 0;
}

export function rivalsMinHand(state: PresidentState, seat: SeatId): number {
  const rivals = activeSeats(state).filter((other) => other !== seat);
  if (rivals.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...rivals.map((other) => handOf(state, other).length));
}

export function sortedByStrength(hand: readonly string[]): string[] {
  return [...hand]
    .filter((card) => tryOrder(card) !== null)
    .sort((a, b) => (tryOrder(b) ?? 0) - (tryOrder(a) ?? 0) || a.localeCompare(b));
}

/**
 * Builds the card list for a give/return exchange move.
 *
 * `want` controls which end of the hand is spent: 'best' for giving away
 * (President to Scum), 'worst' for returning (Scum to President). `keepTwos`
 * preserves 2s when true — the bot that holds them wants to keep them, and the
 * bot that hands them over wants to send junk instead.
 */
export function exchangePayload(
  state: PresidentState,
  seat: SeatId,
  want: 'best' | 'worst',
  keepTwos: boolean,
  rng: Rng,
): LegalMove | null {
  const order = state.lastOrder ?? [];
  if (!order.includes(seat)) return null;
  const returning = state.awaitingReturn?.seat === seat;
  const expected = state.awaitingReturn?.count;
  const count =
    returning && typeof expected === 'number'
      ? expected
      : giftCountFor(roleFor(order, seat) ?? 'neutral');
  const hand = handOf(state, seat);
  let pool = want === 'best' ? sortedByStrength(hand) : [...sortedByStrength(hand)].reverse();
  if (keepTwos && want === 'worst') {
    const spare = pool.filter((card) => tryOrder(card) !== TWO_ORDER);
    const twos = pool.filter((card) => tryOrder(card) === TWO_ORDER);
    if (spare.length >= count) pool = [...spare, ...twos];
  }
  const opaque = hand.filter((card) => tryOrder(card) === null);
  const chosen = pool.slice(0, count);
  while (chosen.length < count && opaque.length > 0) chosen.push(opaque.shift()!);
  while (chosen.length < count) {
    const filler = hand.find((card) => !chosen.includes(card));
    if (!filler) break;
    chosen.push(filler);
  }
  void rng;
  return {
    id: returning ? 'returnCards' : 'giveCards',
    payload: { cards: chosen },
  };
}

export function passMove(legal: readonly LegalMove[]): LegalMove | null {
  return legal.find((move) => move.id === 'pass') ?? null;
}

export interface ScoreWeights {
  rankWeight: number;
  breakWeight: number;
  twoCost: number;
}

export function candidateScore(
  candidate: Candidate,
  counts: Map<number, number>,
  weights: ScoreWeights,
): number {
  let score = candidate.rank * weights.rankWeight;
  score += breakPenalty(counts, candidate.rank, candidate.size) * weights.breakWeight;
  if (candidate.rank === TWO_ORDER) score += weights.twoCost;
  score -= candidate.size * 1.5;
  return score;
}

export function chooseScored(
  state: PresidentState,
  seat: SeatId,
  legal: readonly LegalMove[],
  weights: ScoreWeights,
  passThreshold: number | null,
): LegalMove | null {
  const sets = setCandidates(legal);
  if (sets.length === 0) return passMove(legal);
  const counts = groupCounts(handOf(state, seat));
  const scored = sets.map((candidate) => ({
    candidate,
    score: candidateScore(candidate, counts, weights),
  }));
  scored.sort((a, b) => a.score - b.score || a.candidate.rank - b.candidate.rank);
  const cheapest = scored[0]!;
  if (passThreshold !== null && cheapest.score > passThreshold) {
    const pass = passMove(legal);
    if (pass) return pass;
  }
  return cheapest.candidate.move;
}
