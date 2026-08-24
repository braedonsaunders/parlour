import { describe, expect, it } from 'vitest';
import { EXACT_BONUS, buildSummary, rankByScore, scoreBid, scoreRound } from './score';

describe('scoreBid', () => {
  it('pays 10 + bid only on exact makes (exactOnly)', () => {
    expect(scoreBid(3, 3, 'exactOnly')).toBe(13);
    expect(scoreBid(0, 0, 'exactOnly')).toBe(EXACT_BONUS);
    expect(scoreBid(4, 5, 'exactOnly')).toBe(0);
    expect(scoreBid(4, 3, 'exactOnly')).toBe(0);
  });

  it('charges the size of the miss under penalty', () => {
    expect(scoreBid(3, 3, 'penalty')).toBe(13);
    expect(scoreBid(4, 1, 'penalty')).toBe(-3);
    expect(scoreBid(2, 4, 'penalty')).toBe(-2);
  });

  it('doubles the bid on a make and pays nothing otherwise (plusOne)', () => {
    expect(scoreBid(3, 3, 'plusOne')).toBe(6); // bid + 1 per trick taken
    expect(scoreBid(5, 5, 'plusOne')).toBe(10);
    expect(scoreBid(5, 4, 'plusOne')).toBe(0);
  });
});

describe('scoreRound', () => {
  const bids = [3, 0, 2, 4];

  it('scores every seat from tricks won', () => {
    expect(scoreRound(bids, [3, 1, 2, 0], 'exactOnly')).toEqual([13, 0, 12, 0]);
    expect(scoreRound(bids, [3, 1, 2, 0], 'penalty')).toEqual([13, -1, 12, -4]);
  });

  it('handles the round where EVERY player misses', () => {
    // bids total 9 but 10 tricks were played — nobody hit their number
    const won = [2, 1, 4, 3];
    expect(scoreRound(bids, won, 'exactOnly')).toEqual([0, 0, 0, 0]);
    expect(scoreRound(bids, won, 'plusOne')).toEqual([0, 0, 0, 0]);
    expect(scoreRound(bids, won, 'penalty')).toEqual([-1, -1, -2, -1]);
  });

  it('also handles the all-zero round where zero-bidders sneak through', () => {
    expect(scoreRound([0, 0, 0, 0], [1, 2, 0, 1], 'exactOnly')).toEqual([0, 0, 10, 0]);
  });
});

describe('buildSummary', () => {
  it('records the round for the table snapshot', () => {
    const summary = buildSummary({
      handSize: 3,
      dealer: 2,
      trumpSuit: 'spades',
      bids: [1, 2, 0, 0],
      tricksWon: [1, 1, 0, 1],
      scheme: 'exactOnly',
    });
    expect(summary.points).toEqual([11, 0, 10, 0]);
    expect(summary.bids).toEqual([1, 2, 0, 0]);
    expect(summary.trumpSuit).toBe('spades');
  });
});

describe('rankByScore', () => {
  it('ranks highest first with ties sharing a rank', () => {
    const ranked = rankByScore([5, 8, 8, 1], 'round-complete');
    expect(ranked.rankings.map((row) => row.seat)).toEqual([1, 2, 0, 3]);
    expect(ranked.rankings.map((row) => row.rank)).toEqual([1, 1, 3, 4]);
    expect(ranked.winner).toBeNull(); // tied top is nobody's win
  });

  it('names a unique leader', () => {
    const ranked = rankByScore([7, 3, 9], 'round-complete');
    expect(ranked.winner).toBe(2);
  });
});
