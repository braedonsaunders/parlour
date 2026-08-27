import type { CardId } from '@parlour/engine';
import { PINOCHLE_SUITS, rankOfCard, suitOfCard, type PinochleSuit } from './cards';

/**
 * One seat's meld, broken down by category. A card may count toward one
 * run/marriage category AND an "around" AND pinochle at once (the standard
 * pinochle double-count) — only the run/marriage consumption below is
 * card-disjoint, because the locked ruleset folds the royal marriage into the
 * run it belongs to rather than scoring both.
 */
export interface MeldBreakdown {
  /** Trump run A-10-K-Q-J, 15 points. */
  run: number;
  /** A second trump K+Q beyond the pair the run already used, 2 points each. */
  extraMarriage: number;
  /** Trump K+Q marriages when there is no run, 4 points each. */
  royalMarriage: number;
  /** Non-trump K+Q marriages, 2 points each. */
  commonMarriage: number;
  /** Q♠ + J♦, 4 points; both copies of each is a double pinochle at 30 instead. */
  pinochle: number;
  acesAround: number;
  kingsAround: number;
  queensAround: number;
  jacksAround: number;
  /** 9 of trump, 1 point each (up to 2 in a 48-card deck). */
  dix: number;
  total: number;
}

const PINOCHLE_SPADE_Q = 'SQ';
const PINOCHLE_DIAMOND_J = 'DJ';

function countBy(hand: readonly CardId[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of hand) {
    const suit = suitOfCard(card);
    const rank = rankOfCard(card);
    if (suit === null || rank === null) continue;
    const key = `${suit}${rank}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Pure meld enumerator: every legal meld category in one hand for a named
 * trump. Does not touch the hand — melded cards stay in hand for play.
 */
export function computeMeld(hand: readonly CardId[], trump: PinochleSuit): MeldBreakdown {
  const count = countBy(hand);
  const of = (suit: PinochleSuit, rank: string): number => count.get(`${suit}${rank}`) ?? 0;

  const hasRun =
    of(trump, 'A') >= 1 &&
    of(trump, '10') >= 1 &&
    of(trump, 'K') >= 1 &&
    of(trump, 'Q') >= 1 &&
    of(trump, 'J') >= 1;
  const run = hasRun ? 15 : 0;

  const trumpKRemaining = of(trump, 'K') - (hasRun ? 1 : 0);
  const trumpQRemaining = of(trump, 'Q') - (hasRun ? 1 : 0);
  const trumpMarriages = Math.max(0, Math.min(trumpKRemaining, trumpQRemaining));
  const extraMarriage = hasRun ? trumpMarriages * 2 : 0;
  const royalMarriage = hasRun ? 0 : trumpMarriages * 4;

  let commonMarriage = 0;
  for (const suit of PINOCHLE_SUITS) {
    if (suit === trump) continue;
    commonMarriage += Math.max(0, Math.min(of(suit, 'K'), of(suit, 'Q'))) * 2;
  }

  const spadeQueens = count.get(PINOCHLE_SPADE_Q) ?? 0;
  const diamondJacks = count.get(PINOCHLE_DIAMOND_J) ?? 0;
  const doublePinochle = spadeQueens === 2 && diamondJacks === 2;
  const pinochle = doublePinochle ? 30 : spadeQueens >= 1 && diamondJacks >= 1 ? 4 : 0;

  const around = (rank: string): boolean => PINOCHLE_SUITS.every((suit) => of(suit, rank) >= 1);
  const acesAround = around('A') ? 10 : 0;
  const kingsAround = around('K') ? 8 : 0;
  const queensAround = around('Q') ? 6 : 0;
  const jacksAround = around('J') ? 4 : 0;

  const dix = of(trump, '9');

  const total =
    run +
    extraMarriage +
    royalMarriage +
    commonMarriage +
    pinochle +
    acesAround +
    kingsAround +
    queensAround +
    jacksAround +
    dix;

  return {
    run,
    extraMarriage,
    royalMarriage,
    commonMarriage,
    pinochle,
    acesAround,
    kingsAround,
    queensAround,
    jacksAround,
    dix,
    total,
  };
}

export const EMPTY_MELD: MeldBreakdown = {
  run: 0,
  extraMarriage: 0,
  royalMarriage: 0,
  commonMarriage: 0,
  pinochle: 0,
  acesAround: 0,
  kingsAround: 0,
  queensAround: 0,
  jacksAround: 0,
  dix: 0,
  total: 0,
};
