import { describe, expect, it } from 'vitest';
import { applyResult, EMPTY_STATS, knockSuccessRate } from './profile';

describe('lifetime profile stats', () => {
  it('records one completed match and its round achievements', () => {
    const next = applyResult(EMPTY_STATS, {
      won: true,
      blitzes: 2,
      knocks: 3,
      knockWins: 2,
    });

    expect(next).toEqual({
      games: 1,
      wins: 1,
      blitzes: 2,
      knocks: 3,
      knockWins: 2,
      bestStreak: 1,
      currentStreak: 1,
    });
    expect(knockSuccessRate(next)).toBeCloseTo(2 / 3);
  });

  it('does not invent a knock success rate before the player knocks', () => {
    expect(knockSuccessRate(EMPTY_STATS)).toBe(0);
  });

  it('resets the current streak on a loss without losing the best streak', () => {
    const prior = { ...EMPTY_STATS, games: 4, wins: 3, bestStreak: 3, currentStreak: 3 };
    const next = applyResult(prior, { won: false, blitzes: 0, knocks: 1, knockWins: 0 });

    expect(next.games).toBe(5);
    expect(next.currentStreak).toBe(0);
    expect(next.bestStreak).toBe(3);
    expect(next.knocks).toBe(1);
  });

  it('rejects invalid achievement counts at the persistence boundary', () => {
    const next = applyResult(EMPTY_STATS, {
      won: false,
      blitzes: Number.NaN,
      knocks: -4,
      knockWins: 1.9,
    });

    expect(next.blitzes).toBe(0);
    expect(next.knocks).toBe(0);
    expect(next.knockWins).toBe(1);
  });
});
