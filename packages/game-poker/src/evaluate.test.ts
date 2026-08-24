import { describe, expect, it } from 'vitest';
import type { CardId } from '@parlour/engine';
import { DECK, rankOf, suitOf } from './cards';
import { Category, compareHands, rankHand, type HandRank } from './evaluate';

/** Card ids read the way they are written at a table: 'As', 'Td', '7c'. */
function hand(...spec: string[]): CardId[] {
  const suits: Record<string, string> = { c: 'C', d: 'D', h: 'H', s: 'S' };
  const ranks: Record<string, number> = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
  return spec.map((text) => {
    const rank = ranks[text[0] as string] ?? Number(text.slice(0, -1));
    const suit = suits[text[text.length - 1] as string];
    const id = `${suit}${rank}`;
    if (!DECK.faces[id]) throw new Error(`no such card: ${text}`);
    return id;
  });
}

// ---------------------------------------------------------------------------
// An independent five-card reference, written the naive way on purpose.
//
// It shares no code with evaluate.ts, so agreement between the two is real
// evidence rather than the same mistake made twice.
// ---------------------------------------------------------------------------

function naiveFive(cards: readonly CardId[]): number[] {
  if (cards.length !== 5) throw new Error('reference takes exactly five cards');
  const ranks = cards.map(rankOf).sort((left, right) => right - left);
  const flush = new Set(cards.map(suitOf)).size === 1;

  const distinct = [...new Set(ranks)].sort((left, right) => right - left);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if ((distinct[0] as number) - (distinct[4] as number) === 4)
      straightHigh = distinct[0] as number;
    if (distinct.join(',') === '14,5,4,3,2') straightHigh = 5;
  }

  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const shape = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0],
  );
  const byCount = shape.map(([rank]) => rank);
  const sizes = shape.map(([, count]) => count).join('');

  if (straightHigh && flush) return [Category.StraightFlush, straightHigh];
  if (sizes.startsWith('4')) return [Category.Quads, ...byCount];
  if (sizes === '32') return [Category.FullHouse, ...byCount];
  if (flush) return [Category.Flush, ...ranks];
  if (straightHigh) return [Category.Straight, straightHigh];
  if (sizes.startsWith('3')) return [Category.Trips, ...byCount];
  if (sizes === '221') return [Category.TwoPair, ...byCount];
  if (sizes.startsWith('2')) return [Category.Pair, ...byCount];
  return [Category.HighCard, ...ranks];
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function combinations<T>(items: readonly T[], choose: number): T[][] {
  if (choose === 0) return [[]];
  if (items.length < choose) return [];
  const [head, ...rest] = items as [T, ...T[]];
  return [
    ...combinations(rest, choose - 1).map((combo) => [head, ...combo]),
    ...combinations(rest, choose),
  ];
}

/** The best five-card vector inside any holding, by brute force. */
function naiveBest(cards: readonly CardId[]): number[] {
  return combinations(cards, 5)
    .map(naiveFive)
    .reduce((best, candidate) => (compareVectors(candidate, best) > 0 ? candidate : best));
}

/** Deterministic shuffle — no Math.random anywhere in this repo. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function dealRandom(next: () => number, count: number): CardId[] {
  const deck = [...DECK.cardIds];
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap] as CardId, deck[index] as CardId];
  }
  return deck.slice(0, count);
}

describe('naming a hand', () => {
  const cases: [CardId[], number, string][] = [
    [hand('Ah', 'Kh', 'Qh', 'Jh', 'Th'), Category.StraightFlush, 'Royal flush'],
    [hand('9c', '8c', '7c', '6c', '5c'), Category.StraightFlush, 'Straight flush, nine high'],
    [hand('5d', '4d', '3d', '2d', 'Ad'), Category.StraightFlush, 'Straight flush, five high'],
    [hand('Kc', 'Kd', 'Kh', 'Ks', '3c'), Category.Quads, 'Four of a kind, kings'],
    [hand('Kc', 'Kd', 'Kh', '3s', '3c'), Category.FullHouse, 'Full house, kings over threes'],
    [hand('Ac', 'Jc', '9c', '6c', '3c'), Category.Flush, 'Flush, ace high'],
    [hand('9c', '8d', '7h', '6s', '5c'), Category.Straight, 'Straight, nine high'],
    [hand('5c', '4d', '3h', '2s', 'Ac'), Category.Straight, 'Straight, five high'],
    [hand('7c', '7d', '7h', 'Ks', '3c'), Category.Trips, 'Three of a kind, sevens'],
    [hand('Jc', 'Jd', '4h', '4s', '9c'), Category.TwoPair, 'Two pair, jacks and fours'],
    [hand('8c', '8d', 'Ah', '6s', '3c'), Category.Pair, 'Pair of eights'],
    [hand('Ac', 'Jd', '9h', '6s', '3c'), Category.HighCard, 'Ace high'],
    [hand('6c', '6d', 'Ah', '9s', '3c'), Category.Pair, 'Pair of sixes'],
  ];

  for (const [cards, category, label] of cases) {
    it(`calls it ${label.toLowerCase()}`, () => {
      const ranked = rankHand(cards);
      expect(ranked.category).toBe(category);
      expect(ranked.label).toBe(label);
      expect(ranked.cards).toHaveLength(5);
    });
  }
});

describe('picking five from seven', () => {
  it('takes the full house over the flush it also holds', () => {
    // Four clubs plus a paired board: a short-circuiting evaluator that checks
    // flush before full house would call this a flush and lose the pot.
    const ranked = rankHand(hand('Kc', 'Kd', 'Kh', '3c', '3s', '9c', '2c'));
    expect(ranked.category).toBe(Category.FullHouse);
    expect(ranked.label).toBe('Full house, kings over threes');
  });

  it('takes the straight flush over the higher plain flush', () => {
    const ranked = rankHand(hand('Ac', 'Kc', '9c', '8c', '7c', '6c', '5c'));
    expect(ranked.category).toBe(Category.StraightFlush);
    expect(ranked.label).toBe('Straight flush, nine high');
  });

  it('uses the best kicker available', () => {
    const ranked = rankHand(hand('As', 'Ad', 'Kc', 'Qh', '7s', '4d', '2c'));
    expect(ranked.category).toBe(Category.Pair);
    expect(ranked.kickers).toEqual([14, 13, 12, 7]);
  });

  it('reports the five cards that actually make the hand', () => {
    const ranked = rankHand(hand('9c', '8d', '7h', '6s', '5c', 'Ah', 'Kd'));
    expect(ranked.category).toBe(Category.Straight);
    expect([...ranked.cards].sort()).toEqual([...hand('9c', '8d', '7h', '6s', '5c')].sort());
  });

  it('does not build a straight out of a paired run', () => {
    const ranked = rankHand(hand('9c', '9d', '8h', '7s', '6c', '2d', '3h'));
    expect(ranked.category).toBe(Category.Pair);
  });
});

describe('ordering hands', () => {
  it('ranks the categories in the traditional order', () => {
    const ladder = [
      hand('Ac', 'Jd', '9h', '6s', '3c'),
      hand('8c', '8d', 'Ah', '6s', '3c'),
      hand('Jc', 'Jd', '4h', '4s', '9c'),
      hand('7c', '7d', '7h', 'Ks', '3c'),
      hand('9c', '8d', '7h', '6s', '5c'),
      hand('Ac', 'Jc', '9c', '6c', '3c'),
      hand('Kc', 'Kd', 'Kh', '3s', '3c'),
      hand('Kc', 'Kd', 'Kh', 'Ks', '3c'),
      hand('9c', '8c', '7c', '6c', '5c'),
    ].map(rankHand);

    for (let index = 1; index < ladder.length; index++) {
      expect(
        compareHands(ladder[index] as HandRank, ladder[index - 1] as HandRank),
      ).toBeGreaterThan(0);
    }
  });

  it('splits a pot when two hands are genuinely equal', () => {
    // Same five-card hand, different suits — the board plays and the pot splits.
    const left = rankHand(hand('Ac', 'Ad', 'Kh', 'Qs', 'Jc', '9d', '2h'));
    const right = rankHand(hand('Ah', 'As', 'Kh', 'Qs', 'Jc', '9d', '2h'));
    expect(compareHands(left, right)).toBe(0);
  });

  it('beats the wheel with any other straight', () => {
    const wheel = rankHand(hand('5c', '4d', '3h', '2s', 'Ac'));
    const six = rankHand(hand('6c', '5d', '4h', '3s', '2c'));
    expect(compareHands(six, wheel)).toBeGreaterThan(0);
  });

  it('refuses a holding too small to be a hand', () => {
    expect(() => rankHand(hand('Ac', 'Kd', 'Qh', 'Js'))).toThrow(/at least five/);
  });
});

describe('against an independent reference', () => {
  it('agrees on ten thousand random seven-card holdings', () => {
    const next = lcg(0x5eed);
    for (let trial = 0; trial < 10_000; trial++) {
      const cards = dealRandom(next, 7);
      const ranked = rankHand(cards);
      const reference = naiveBest(cards);
      expect([ranked.category, ...ranked.kickers].slice(0, reference.length)).toEqual(reference);
    }
  });

  it('orders random pairs of holdings the same way the reference does', () => {
    const next = lcg(0xd00d);
    for (let trial = 0; trial < 5_000; trial++) {
      const board = dealRandom(next, 5);
      const rest = [...DECK.cardIds].filter((card) => !board.includes(card));
      const pick = (): CardId[] => {
        const first = Math.floor(next() * rest.length);
        let second = Math.floor(next() * rest.length);
        if (second === first) second = (second + 1) % rest.length;
        return [rest[first] as CardId, rest[second] as CardId];
      };
      const left = [...pick(), ...board];
      const right = [...pick(), ...board];
      expect(Math.sign(compareHands(rankHand(left), rankHand(right)))).toBe(
        Math.sign(compareVectors(naiveBest(left), naiveBest(right))),
      );
    }
  });
});
