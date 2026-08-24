import { describe, expect, it } from 'vitest';
import type { CardId } from '@parlour/engine';
import { cardValue, rankOf, suitOf, sumValues } from './cards';
import {
  hasNobs,
  isFourCardFlush,
  pegPlayScore,
  scoreFifteens,
  scorePairs,
  scoreRuns,
  scoreShow,
} from './score';

const S = (rank: number) => `S${rank}` as CardId;
const H = (rank: number) => `H${rank}` as CardId;
const D = (rank: number) => `D${rank}` as CardId;
const C = (rank: number) => `C${rank}` as CardId;

describe('card arithmetic', () => {
  it('parses ranks and suits from standard deck ids', () => {
    expect(rankOf(S(1))).toBe(1);
    expect(rankOf(H(13))).toBe(13);
    expect(suitOf(D(7))).toBe('D');
    expect(suitOf(C(11))).toBe('C');
  });

  it('counts faces as ten and the ace as one', () => {
    expect(cardValue(S(1))).toBe(1);
    for (let rank = 2; rank <= 10; rank++) expect(cardValue(H(rank))).toBe(rank);
    for (const rank of [11, 12, 13]) expect(cardValue(D(rank))).toBe(10);
  });

  it('rejects ids that are not in the standard deck', () => {
    expect(() => rankOf('X4' as CardId)).toThrow();
    expect(() => suitOf('S0' as CardId)).toThrow();
    expect(() => cardValue('S14' as CardId)).toThrow();
  });

  it('sums counting values', () => {
    expect(sumValues([S(1), H(11), D(12), C(13)])).toBe(31);
    expect(sumValues([])).toBe(0);
  });
});

describe('fifteens', () => {
  it('scores every subset summing to fifteen', () => {
    // three fives + one jack: jack pairs each five (3) and the three fives make
    // fifteen together (1)
    const entries = scoreFifteens([H(5), D(5), C(5), S(11)]);
    expect(entries.length).toBe(4);
  });

  it('pays two per combination regardless of card count', () => {
    // A + 4 + 10 is the only subset of {1,4,7,10} hitting fifteen
    const entries = scoreFifteens([S(1), H(4), D(10), C(7)]);
    expect(entries.length).toBe(1);
  });
});

describe('canonical show vectors', () => {
  it('scores the 29 hand', () => {
    // J♠ + 5♥ 5♦ 5♣ with the 5♠ cut: eight fifteens (16), six pair-royal
    // combos among four fives (12), and nobs (1).
    const hand = [S(11), H(5), D(5), C(5)];
    const scored = scoreShow(hand, S(5));
    expect(scored.total).toBe(29);
    expect(scored.entries.filter((e) => e.reason === 'fifteen').length).toBe(8);
    expect(scored.entries.filter((e) => e.reason === 'pair').length).toBe(6);
    expect(scored.entries.filter((e) => e.reason === 'nobs').length).toBe(1);
  });

  it('scores a 28 hand when the jack misses nobs', () => {
    const hand = [D(11), H(5), D(5), C(5)];
    const scored = scoreShow(hand, S(5));
    expect(scored.total).toBe(28);
    expect(scored.entries.some((e) => e.reason === 'nobs')).toBe(false);
  });

  it('scores a plain zero hand', () => {
    // values {1,2,8,9,10,10}: no subset makes fifteen, ranks A,2,8,9,J,Q hold
    // no pair and no three-run, suits are mixed and the jack misses nobs
    const scored = scoreShow([C(1), H(2), D(8), S(9)], H(12));
    expect(scored.total).toBe(0);
  });

  it('scores a double run of twelve', () => {
    const scored = scoreShow([H(7), H(8), D(8), S(9)], C(2));
    expect(scored.total).toBe(12); // run 789 twice = 6, pair = 2, fifteens 7+8 twice = 4
    expect(scored.entries.find((e) => e.reason === 'run')?.points).toBe(6);
  });

  it('scores a triple run of twenty-one', () => {
    const scored = scoreShow([H(7), D(7), C(7), S(8)], C(9));
    expect(scored.total).toBe(21); // runs ×3 = 9, trips = 6, fifteens ×3 = 6
  });

  it('absorbs short runs into the maximal run', () => {
    // A-2-3-4 + 9: one four-run (4), not 3+3
    const scored = scoreShow([S(1), H(2), D(3), C(4)], S(9));
    const runs = scored.entries.filter((e) => e.reason === 'run');
    expect(runs.length).toBe(1);
    expect(runs[0]?.points).toBe(4);
  });

  it('counts a four-card flush plus matching starter as five in a hand', () => {
    const scored = scoreShow([H(2), H(5), H(9), H(13)], H(7));
    expect(scored.entries.filter((e) => e.reason === 'flush').map((e) => e.points)).toEqual([5]);
  });

  it('keeps the starter out of a four-card flush miss', () => {
    const scored = scoreShow([H(2), H(5), H(9), H(13)], S(7));
    expect(scored.entries.filter((e) => e.reason === 'flush').map((e) => e.points)).toEqual([4]);
  });

  it('denies the four-card flush in the crib', () => {
    const scored = scoreShow([H(2), H(5), H(9), H(13)], S(7), { isCrib: true });
    expect(scored.entries.some((e) => e.reason === 'flush')).toBe(false);
  });

  it('allows only an all-five flush in the crib', () => {
    const scored = scoreShow([H(2), H(5), H(9), H(13)], H(7), { isCrib: true });
    const flushes = scored.entries.filter((e) => e.reason === 'flush');
    expect(flushes.map((e) => e.points)).toEqual([5]);
    // the same cards carry one fifteen (K + 5)
    expect(scored.entries.filter((e) => e.reason === 'fifteen').length).toBe(1);
  });

  it('pays nobs for the jack of the starter suit only', () => {
    expect(hasNobs([S(11), H(3), D(3), C(9)], S(7))).toBe(true);
    expect(hasNobs([H(11), H(3), D(3), C(9)], S(7))).toBe(false);
    expect(hasNobs([S(12), H(3), D(3), C(9)], S(7))).toBe(false);
  });

  it('composes runs, pairs and fifteens without a flush when a suit misses', () => {
    // 7♥ 8♥ 9♥ 9♦ + 8♠: double run (12), two pairs (4), fifteens 7+8 twice (4)
    // — the diamond kills any flush
    const scored = scoreShow([H(7), H(8), H(9), D(9)], S(8));
    expect(scored.total).toBe(20);
    expect(scored.entries.some((e) => e.reason === 'flush')).toBe(false);
  });

  it('cross-checks combo accounting against direct subset enumeration', () => {
    const hands: [readonly CardId[], CardId][] = [
      [[S(10), H(10), D(6), C(4)], S(5)],
      [[H(1), D(1), C(2), S(3)], H(4)],
      [[C(9), C(10), D(10), H(10)], S(9)],
      [[S(2), S(3), D(4), H(5)], C(6)],
      [[D(12), C(12), H(12), S(1)], D(2)],
      [[S(7), H(8), D(9), C(9)], S(8)],
    ];
    for (const [hand, starter] of hands) {
      const all = [...hand, starter];
      const comboTotal =
        scoreFifteens(all).reduce((total, entry) => total + entry.points, 0) +
        scorePairs(all).reduce((total, entry) => total + entry.points, 0) +
        scoreRuns(all).reduce((total, entry) => total + entry.points, 0);
      const scored = scoreShow(hand, starter);
      expect(scored.total - flushAndNobsDelta(hand, starter, false)).toBe(comboTotal);
    }
  });
});

function flushAndNobsDelta(hand: readonly CardId[], starter: CardId, isCrib: boolean): number {
  let delta = 0;
  if (isFourCardFlush(hand)) {
    const five = hand.every((card) => suitOf(card) === suitOf(starter));
    if (isCrib) delta += five ? 5 : 0;
    else delta += five ? 5 : 4;
  }
  if (hasNobs(hand, starter)) delta += 1;
  return delta;
}

describe('pegging combos', () => {
  it('pays two for landing the count on fifteen', () => {
    expect(pegPlayScore([H(5)], D(12))).toEqual({ points: 2, reasons: ['fifteen'] });
    expect(pegPlayScore([], S(1))).toEqual({ points: 0, reasons: [] });
  });

  it('pays pairs, trips and quads on trailing equal ranks', () => {
    expect(pegPlayScore([H(9)], D(9)).points).toBe(2);
    expect(pegPlayScore([H(9), S(9)], D(9)).points).toBe(6);
    expect(pegPlayScore([H(9), S(9), C(9)], D(9)).points).toBe(12);
    expect(pegPlayScore([H(9)], D(9)).reasons).toEqual(['pair']);
    expect(pegPlayScore([H(9), S(9)], D(9)).reasons).toEqual(['trip']);
    expect(pegPlayScore([H(9), S(9), C(9)], D(9)).reasons).toEqual(['quad']);
  });

  it('finds runs regardless of play order', () => {
    expect(pegPlayScore([H(3), S(1)], D(2)).points).toBe(3);
    expect(pegPlayScore([H(3), S(1), C(2)], D(4)).points).toBe(4);
    expect(pegPlayScore([D(4), C(2), H(3)], S(1)).points).toBe(4);
  });

  it('does not pay runs through gaps or non-suffix windows', () => {
    expect(pegPlayScore([H(3), S(1), C(6)], D(2)).points).toBe(0);
    // A-2-3 earlier in the pile does not combine with a later isolated play
    expect(pegPlayScore([S(1), H(2), D(3), C(13)], S(13)).points).toBe(2); // pair only
  });

  it('stacks combo classes in a single play', () => {
    // a third five makes fifteen AND a pair royal in the same lay
    const result = pegPlayScore([H(5), D(5)], C(5));
    expect(result.points).toBe(8);
    expect([...result.reasons].sort()).toEqual(['fifteen', 'trip']);
    expect(pegPlayScore([], S(1)).points).toBe(0); // an ace alone scores nothing
  });

  it('pays exactly thirty-one as its own class', () => {
    // K K Q A: the running count lands on 31 with no trailing pair
    const result = pegPlayScore([H(13), D(13), C(12)], S(1));
    expect(result.points).toBe(2);
    expect(result.reasons).toEqual(['thirtyone']);
  });

  it('caps the trailing-run scan at seven cards', () => {
    const pile: CardId[] = [];
    for (let rank = 13; rank >= 8; rank--) pile.push(S(rank));
    const result = pegPlayScore(pile, H(7)); // completes 7..K, seven distinct ranks
    expect(result.points).toBe(7);
  });
});
