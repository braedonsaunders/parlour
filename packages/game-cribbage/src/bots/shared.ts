import { stdDeck, type CardId, type Rng } from '@parlour/engine';
import { cardValue } from '../cards';
import { scoreShow } from '../score';
import type { CribbageState } from '../state';

/** All 52 card ids, materialised once (stdDeck order). */
export const ALL_CARDS: readonly CardId[] = stdDeck().cardIds;

/** Cards the seat cannot see right now: the pool a starter sample draws from. */
export function unseenCards(view: CribbageState, seat: number): CardId[] {
  const known = new Set<CardId>([
    ...(view.hands[seat] ?? []),
    ...view.played,
    ...(view.starter ? [view.starter] : []),
    ...(view.showDone ? view.crib : []),
  ]);
  return ALL_CARDS.filter((card) => !known.has(card));
}

export interface KeepOption {
  discard: readonly [CardId, CardId];
  keep: readonly CardId[];
}

/** Every way to throw two of six to the crib. */
export function keepOptions(hand: readonly CardId[]): KeepOption[] {
  const options: KeepOption[] = [];
  for (let a = 0; a < hand.length; a++) {
    for (let b = a + 1; b < hand.length; b++) {
      options.push({
        discard: [hand[a] as CardId, hand[b] as CardId],
        keep: hand.filter((_, index) => index !== a && index !== b),
      });
    }
  }
  return options;
}

/** Mean hand value of `keep` across the sampled starters. */
export function expectedKeepValue(keep: readonly CardId[], starters: readonly CardId[]): number {
  if (starters.length === 0) return 0;
  let total = 0;
  for (const starter of starters) total += scoreShow(keep, starter).total;
  return total / starters.length;
}

/**
 * Heuristic crib worth of two thrown cards. Positive when feeding your own
 * crib (fifteen bodies, pairs and connected cards), near zero for dead faces.
 */
export function cribPotential(pair: readonly CardId[]): number {
  const [a, b] = pair as [CardId, CardId];
  const va = cardValue(a);
  const vb = cardValue(b);
  let value = 0;
  for (const v of [va, vb]) if (v === 5) value += 2; // fives are crib gold
  if ((a as string).slice(1) === (b as string).slice(1)) value += va >= 5 ? 3 : 2;
  else if (Math.abs(va - vb) <= 2) value += 1;
  return value;
}

/** Deterministic starter sample from the unseen pool. */
export function sampleStarters(pool: readonly CardId[], rng: Rng, count: number): CardId[] {
  if (pool.length === 0) return [];
  const sample: CardId[] = [];
  for (let index = 0; index < count; index++) sample.push(rng.pick(pool));
  return sample;
}

/**
 * Rough danger that an opponent answers our play with a pair, estimated from
 * how many unseen cards share the rank we just laid. Run-extension pressure
 * folds in as a quarter-weight for adjacent ranks.
 */
export function answerRisk(pile: readonly CardId[], pool: readonly CardId[]): number {
  if (pile.length === 0 || pool.length === 0) return 0;
  const lastRank = Number((pile[pile.length - 1] as CardId).slice(1));
  const prevRank = pile.length >= 2 ? Number((pile[pile.length - 2] as CardId).slice(1)) : null;
  let risky = 0;
  for (const card of pool) {
    const rank = Number(card.slice(1));
    if (rank === lastRank) risky += 1;
    else if (prevRank !== null && Math.abs(rank - (lastRank + prevRank) / 2) <= 2) risky += 0.25;
  }
  return risky / pool.length;
}
