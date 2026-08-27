import type { CardId, Rng } from '@parlour/engine';
import { PINOCHLE_SUITS, rankOfCard, suitOfCard, trickRankOf, type PinochleSuit } from '../cards';
import { computeMeld } from '../meld';

/** Nudges a base value by up to `amount` in either direction, off the seeded rng. */
export function jitter(base: number, amount: number, rng: Rng): number {
  if (amount === 0) return base;
  return base + (rng.float() * 2 - 1) * amount;
}

export interface TrumpCandidate {
  suit: PinochleSuit;
  meldTotal: number;
  length: number;
}

/** The suit that melds best in a hand — the natural trump call. */
export function bestTrumpCandidate(hand: readonly CardId[]): TrumpCandidate {
  let best: TrumpCandidate = { suit: PINOCHLE_SUITS[0], meldTotal: -1, length: -1 };
  for (const suit of PINOCHLE_SUITS) {
    const meldTotal = computeMeld(hand, suit).total;
    const length = hand.filter((card) => suitOfCard(card) === suit).length;
    if (meldTotal > best.meldTotal || (meldTotal === best.meldTotal && length > best.length)) {
      best = { suit, meldTotal, length };
    }
  }
  return best;
}

/** Rough bidding value: meld ceiling, plus credit for trump length and aces/tens/kings. */
export function handStrength(hand: readonly CardId[]): { suit: PinochleSuit; estimate: number } {
  const candidate = bestTrumpCandidate(hand);
  const highCards = hand.filter((card) => {
    const rank = rankOfCard(card);
    return rank === 'A' || rank === '10' || rank === 'K';
  }).length;
  const estimate = candidate.meldTotal + candidate.length * 2 + highCards * 2;
  return { suit: candidate.suit, estimate };
}

export function trumpCount(hand: readonly CardId[], trump: PinochleSuit): number {
  return hand.filter((card) => suitOfCard(card) === trump).length;
}

export function cardWeight(card: CardId): number {
  return trickRankOf(card);
}

export function weakestCard(cards: readonly CardId[]): CardId {
  return cards.reduce((worst, card) => (cardWeight(card) < cardWeight(worst) ? card : worst));
}

export function strongestCard(cards: readonly CardId[]): CardId {
  return cards.reduce((best, card) => (cardWeight(card) > cardWeight(best) ? card : best));
}
