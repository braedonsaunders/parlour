import type { CardId, LegalMove, SeatId } from '@parlour/engine';
import {
  DRAW_TWO_RANK,
  EIGHTS_SUITS,
  REVERSE_RANK,
  SKIP_RANK,
  cardValue,
  isWild,
  rankOf,
  suitOf,
  type EightsSuit,
} from '../cards';
import type { EightsRules } from '../config';
import type { EightsState } from '../state';

/**
 * Shared bot evaluation helpers for Crazy Eights.
 *
 * Every tier reads the same game state through the same primitives; the
 * difference is how each tier weights the numbers.
 */

export function ownHand(view: EightsState, seat: SeatId): readonly CardId[] {
  return view.round.hands[seat] ?? [];
}

export function payloadCard(move: LegalMove): CardId | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

export function payloadSuit(move: LegalMove): EightsSuit | null {
  const suit = (move.payload as { suit?: unknown } | undefined)?.suit;
  return EIGHTS_SUITS.includes(suit as EightsSuit) ? (suit as EightsSuit) : null;
}

/** The suit a bot is longest in, ignoring eights that fit anywhere. */
export function preferredSuit(view: EightsState, seat: SeatId): EightsSuit {
  const counts = new Map<EightsSuit, number>(EIGHTS_SUITS.map((suit) => [suit, 0]));
  for (const card of ownHand(view, seat)) {
    if (isWild(card)) continue;
    const suit = suitOf(card);
    counts.set(suit, (counts.get(suit) ?? 0) + 1);
  }
  return EIGHTS_SUITS.reduce((best, suit) =>
    (counts.get(suit) ?? 0) > (counts.get(best) ?? 0) ? suit : best,
  );
}

export function suitLength(view: EightsState, seat: SeatId, suit: EightsSuit): number {
  return ownHand(view, seat).filter((card) => !isWild(card) && suitOf(card) === suit).length;
}

/** The smallest hand anyone else is showing — redaction leaves counts readable. */
export function closestRival(view: EightsState, seat: SeatId): number {
  let fewest = Number.POSITIVE_INFINITY;
  view.round.hands.forEach((cards, index) => {
    if (index !== seat) fewest = Math.min(fewest, cards.length);
  });
  return Number.isFinite(fewest) ? fewest : 0;
}

export function firstOf(legal: readonly LegalMove[], ...ids: readonly string[]): LegalMove | null {
  for (const id of ids) {
    const move = legal.find((candidate) => candidate.id === id);
    if (move) return move;
  }
  return null;
}

/**
 * True when a plain (non-eight) match exists in the playable cards.
 *
 * An eight that is spent when a plain match is available is an eight wasted —
 * it could have been saved for when nothing else goes.
 */
export function hasPlainPlay(plays: readonly LegalMove[]): boolean {
  return plays.some((move) => {
    const card = payloadCard(move);
    return card !== null && !isWild(card);
  });
}

/** The suit the pile is asking for right now — the active suit or the suit that must be chosen. */
export function pileSuit(view: EightsState): EightsSuit {
  return view.round.activeSuit;
}

/**
 * Score a playable card for the house and hard bots.
 *
 * Higher scores mean "play this first." The weights are:
 *   - Closing out the hand (last card) wins immediately.
 *   - Plain cards score on their pip value and suit depth.
 *   - Eights are the safety net — score them only when nothing else works.
 *   - Action cards gain weight when a rival is close to going out.
 */
export function cardPlayScore(
  move: LegalMove,
  view: EightsState,
  seat: SeatId,
  pressure: boolean,
  rules: EightsRules,
): number {
  const card = payloadCard(move);
  if (!card) return -1;

  const hand = ownHand(view, seat);

  // Last card wins the round outright.
  if (hand.length === 1) return 10_000;

  if (isWild(card)) {
    // An eight is precious — score it at zero unless it is the only play.
    // The `hasPlainPlay` check at the call site prevents spending it needlessly.
    return 0;
  }

  const rank = rankOf(card);
  const action =
    (rank === DRAW_TWO_RANK && rules.twosDrawTwo) ||
    (rank === SKIP_RANK && rules.queensSkip) ||
    (rank === REVERSE_RANK && rules.acesReverse)
      ? pressure
        ? 90
        : 12
      : 0;

  // Base: value for shedding high cards + depth for staying in a suit we hold.
  return 40 + cardValue(card) * 4 + suitLength(view, seat, suitOf(card)) * 6 + action;
}

/**
 * Pick the best move from a scored list, breaking ties with the rng.
 */
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
