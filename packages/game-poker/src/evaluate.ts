import type { CardId } from '@parlour/engine';
import { byRankDesc, rankName, rankOf, rankPlural, suitOf, type Suit } from './cards';

/**
 * Hand categories, ordered so a larger number is a better hand. The numbers
 * themselves are load-bearing: {@link HandRank.score} packs the category above
 * its tie-breakers, so category order *is* comparison order.
 */
export const Category = {
  HighCard: 1,
  Pair: 2,
  TwoPair: 3,
  Trips: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  Quads: 8,
  StraightFlush: 9,
} as const;

export type CategoryId = (typeof Category)[keyof typeof Category];

export interface HandRank {
  category: CategoryId;
  /**
   * Tie-breakers in significance order, already reduced to what poker actually
   * compares: a full house is [trips, pair] and never the kicker it ignores.
   */
  kickers: readonly number[];
  /** the exact five cards that make the hand, best first — for highlighting */
  cards: readonly CardId[];
  /** total order over every hand; equal scores are genuinely tied hands */
  score: number;
  /** "Full house, kings over threes" */
  label: string;
}

const KICKER_SLOTS = 5;
const RADIX = 15;

/**
 * Packs category and tie-breakers into one comparable integer.
 *
 * Ranks run 2..14, so base 15 gives every slot room without collisions, and
 * five slots is the most any category needs. The largest value this produces is
 * about 7.6M — comfortably inside a safe integer, so `===` on a score means the
 * hands are truly tied and split the pot.
 */
function packScore(category: CategoryId, kickers: readonly number[]): number {
  let score = category;
  for (let slot = 0; slot < KICKER_SLOTS; slot++) {
    score = score * RADIX + (kickers[slot] ?? 0);
  }
  return score;
}

interface RankGroup {
  rank: number;
  cards: CardId[];
}

/** Cards grouped by rank, ordered by count then rank — both descending. */
function groupByRank(cards: readonly CardId[]): RankGroup[] {
  const groups = new Map<number, CardId[]>();
  for (const card of cards) {
    const rank = rankOf(card);
    const bucket = groups.get(rank);
    if (bucket) bucket.push(card);
    else groups.set(rank, [card]);
  }
  return [...groups.entries()]
    .map(([rank, group]) => ({ rank, cards: group.slice().sort(byRankDesc) }))
    .sort((left, right) => right.cards.length - left.cards.length || right.rank - left.rank);
}

function groupBySuit(cards: readonly CardId[]): Map<Suit, CardId[]> {
  const suits = new Map<Suit, CardId[]>();
  for (const card of cards) {
    const suit = suitOf(card);
    if (!suit) continue;
    const bucket = suits.get(suit);
    if (bucket) bucket.push(card);
    else suits.set(suit, [card]);
  }
  return suits;
}

/**
 * Highest five-card straight inside `cards`, as the ranks it spans.
 *
 * The ace plays both ends: it is ranked 14 everywhere else, and lent an extra
 * low slot here so A-2-3-4-5 is found. The wheel is returned five-high, which
 * is what makes it the worst straight rather than the best.
 */
function straightRanks(cards: readonly CardId[]): number[] | null {
  const present = new Set(cards.map(rankOf));
  if (present.has(14)) present.add(1);
  const ordered = [...present].sort((left, right) => right - left);

  for (const high of ordered) {
    if (high < 5) break;
    const span = [high, high - 1, high - 2, high - 3, high - 4];
    if (span.every((rank) => present.has(rank))) {
      // The wheel's ace is held as rank 1 for the run; name it 14 again so the
      // card that satisfies it can actually be found in the pool.
      return span.map((rank) => (rank === 1 ? 14 : rank));
    }
  }
  return null;
}

/** Takes one card of each listed rank, never reusing a card. */
function cardsForRanks(pool: readonly CardId[], ranks: readonly number[]): CardId[] {
  const remaining = pool.slice().sort(byRankDesc);
  const picked: CardId[] = [];
  for (const rank of ranks) {
    const at = remaining.findIndex((card) => rankOf(card) === rank);
    if (at < 0) continue;
    picked.push(remaining[at] as CardId);
    remaining.splice(at, 1);
  }
  return picked;
}

function made(
  category: CategoryId,
  kickers: readonly number[],
  cards: readonly CardId[],
): HandRank {
  return {
    category,
    kickers,
    cards,
    score: packScore(category, kickers),
    label: describe(category, kickers),
  };
}

/** The best hand available from rank multiplicity alone — no flush, no straight. */
function bestByCounts(cards: readonly CardId[]): HandRank {
  const groups = groupByRank(cards);
  const first = groups[0] as RankGroup;
  const second = groups[1];

  const kickersAfter = (used: readonly number[], count: number): number[] =>
    groups
      .filter((group) => !used.includes(group.rank))
      .flatMap((group) => group.cards.map(rankOf))
      .sort((left, right) => right - left)
      .slice(0, count);

  const pick = (ranks: readonly number[]): CardId[] => cardsForRanks(cards, ranks);

  if (first.cards.length === 4) {
    const kicker = kickersAfter([first.rank], 1);
    return made(
      Category.Quads,
      [first.rank, ...kicker],
      pick([first.rank, first.rank, first.rank, first.rank, ...kicker]),
    );
  }

  if (first.cards.length === 3 && second && second.cards.length >= 2) {
    return made(
      Category.FullHouse,
      [first.rank, second.rank],
      pick([first.rank, first.rank, first.rank, second.rank, second.rank]),
    );
  }

  if (first.cards.length === 3) {
    const kickers = kickersAfter([first.rank], 2);
    return made(
      Category.Trips,
      [first.rank, ...kickers],
      pick([first.rank, first.rank, first.rank, ...kickers]),
    );
  }

  if (first.cards.length === 2 && second && second.cards.length === 2) {
    const kicker = kickersAfter([first.rank, second.rank], 1);
    return made(
      Category.TwoPair,
      [first.rank, second.rank, ...kicker],
      pick([first.rank, first.rank, second.rank, second.rank, ...kicker]),
    );
  }

  if (first.cards.length === 2) {
    const kickers = kickersAfter([first.rank], 3);
    return made(
      Category.Pair,
      [first.rank, ...kickers],
      pick([first.rank, first.rank, ...kickers]),
    );
  }

  const top = cards.slice().sort(byRankDesc).slice(0, 5);
  return made(Category.HighCard, top.map(rankOf), top);
}

/**
 * The best five-card hand inside five to seven cards.
 *
 * Categories are computed independently and the highest score wins, rather than
 * short-circuiting in category order. That ordering is where naive evaluators
 * go wrong: a seven-card holding can contain both a flush and a full house, and
 * the full house is the better hand.
 */
export function rankHand(cards: readonly CardId[]): HandRank {
  if (cards.length < 5) {
    throw new Error(`a poker hand needs at least five cards, got ${cards.length}`);
  }

  const candidates: HandRank[] = [bestByCounts(cards)];

  const flushSuit = [...groupBySuit(cards).entries()].find(([, group]) => group.length >= 5);
  if (flushSuit) {
    const suited = flushSuit[1].slice().sort(byRankDesc);
    const straightFlush = straightRanks(suited);
    if (straightFlush) {
      candidates.push(
        made(
          Category.StraightFlush,
          [straightFlush[0] as number],
          cardsForRanks(suited, straightFlush),
        ),
      );
    }
    const top = suited.slice(0, 5);
    candidates.push(made(Category.Flush, top.map(rankOf), top));
  }

  const straight = straightRanks(cards);
  if (straight) {
    // Five-high: the ace is the low end, so the straight is named by its five.
    const high = straight[0] === 14 && straight[1] === 5 ? 5 : (straight[0] as number);
    candidates.push(made(Category.Straight, [high], cardsForRanks(cards, straight)));
  }

  return candidates.reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
}

/** Negative when `left` loses, positive when it wins, zero on a genuine tie. */
export function compareHands(left: HandRank, right: HandRank): number {
  return left.score - right.score;
}

function describe(category: CategoryId, kickers: readonly number[]): string {
  const first = kickers[0] ?? 0;
  const second = kickers[1] ?? 0;
  switch (category) {
    case Category.StraightFlush:
      return first === 14 ? 'Royal flush' : `Straight flush, ${rankName(first)} high`;
    case Category.Quads:
      return `Four of a kind, ${rankPlural(first)}`;
    case Category.FullHouse:
      return `Full house, ${rankPlural(first)} over ${rankPlural(second)}`;
    case Category.Flush:
      return `Flush, ${rankName(first)} high`;
    case Category.Straight:
      return `Straight, ${rankName(first)} high`;
    case Category.Trips:
      return `Three of a kind, ${rankPlural(first)}`;
    case Category.TwoPair:
      return `Two pair, ${rankPlural(first)} and ${rankPlural(second)}`;
    case Category.Pair:
      return `Pair of ${rankPlural(first)}`;
    case Category.HighCard:
      return `${rankName(first).replace(/^./, (char) => char.toUpperCase())} high`;
  }
}

/** A hand named the short way, for chat lines and the showdown strip. */
export function handLabel(cards: readonly CardId[]): string {
  return rankHand(cards).label;
}
