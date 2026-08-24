import { describe, expect, it } from 'vitest';
import { byRankThenId, compareCardIds, orderSpadesHand, rankOfCard } from './cards';

describe('locale-independent card order', () => {
  it('compares ids by explicit lexical order, not localeCompare', () => {
    expect(compareCardIds('C13', 'H13')).toBeLessThan(0);
    expect(compareCardIds('H13', 'C13')).toBeGreaterThan(0);
    expect(compareCardIds('S1', 'S1')).toBe(0);
    expect(['H13', 'S13', 'C13'].sort(compareCardIds)).toEqual(['C13', 'H13', 'S13']);
  });

  it('selects equal-rank multi-suit cards deterministically', () => {
    const kings = ['H13', 'S13', 'D13', 'C13'] as const;
    expect(kings.every((card) => rankOfCard(card) === 13)).toBe(true);
    expect([...kings].sort(byRankThenId)).toEqual(['C13', 'D13', 'H13', 'S13']);
    expect(orderSpadesHand([...kings], {})).toEqual(['C13', 'D13', 'H13', 'S13']);
  });
});
