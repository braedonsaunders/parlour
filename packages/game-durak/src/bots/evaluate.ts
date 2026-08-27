import type { CardId, LegalMove, SeatId } from '@parlour/engine';
import { rankOf, suitOf, type DurakSuit } from '../cards';
import type { DurakState } from '../state';

/**
 * Shared bot evaluation helpers for Durak. Every tier reads the same state
 * through the same primitives; the difference is how each tier weighs them.
 */

export function ownHand(view: DurakState, seat: SeatId): readonly CardId[] {
  return view.hands[seat] ?? [];
}

export function payloadCard(move: LegalMove): CardId | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

/** Non-trump cards cost their rank; a trump costs extra, so it is spent last. */
export function cardCost(card: CardId, trumpSuit: DurakSuit): number {
  const rank = rankOf(card);
  return suitOf(card) === trumpSuit ? rank + 100 : rank;
}

/** How many cards of this rank the seat still holds. */
export function rankCount(hand: readonly CardId[], rank: number): number {
  return hand.filter((card) => rankOf(card) === rank).length;
}

export function firstOf(legal: readonly LegalMove[], ...ids: readonly string[]): LegalMove | null {
  for (const id of ids) {
    const move = legal.find((candidate) => candidate.id === id);
    if (move) return move;
  }
  return null;
}

/** Picks the best move from a scored list, breaking ties with the rng. */
export function bestBy(
  moves: readonly LegalMove[],
  rng: { int(maxExclusive: number): number },
  score: (move: LegalMove) => number,
): LegalMove | null {
  if (moves.length === 0) return null;
  let best: LegalMove[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const value = score(move);
    if (value > bestScore) {
      bestScore = value;
      best = [move];
    } else if (value === bestScore) {
      best.push(move);
    }
  }
  return best[rng.int(best.length)] ?? best[0] ?? null;
}
