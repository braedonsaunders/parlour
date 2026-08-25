import { describe, expect, it } from 'vitest';
import { emptyPyramid, isFree, isKing, rankValue, suitOfCard } from './cards';

describe('Pyramid card rules', () => {
  it('reads standard-deck ranks A=1 through K=13', () => {
    expect(rankValue('S1')).toBe(1);
    expect(rankValue('H10')).toBe(10);
    expect(rankValue('D11')).toBe(11);
    expect(rankValue('C12')).toBe(12);
    expect(rankValue('S13')).toBe(13);
    expect(suitOfCard('H12')).toBe('hearts');
    expect(isKing('S13')).toBe(true);
    expect(isKing('S12')).toBe(false);
  });

  it('treats the last row as free and covers a parent by both children', () => {
    const pyramid = emptyPyramid();
    pyramid[5]![2] = 'S7';
    pyramid[6]![2] = 'H1';
    pyramid[6]![3] = 'D12';
    expect(isFree(pyramid, 6, 2)).toBe(true);
    expect(isFree(pyramid, 6, 3)).toBe(true);
    expect(isFree(pyramid, 5, 2)).toBe(false);
    pyramid[6]![2] = null;
    expect(isFree(pyramid, 5, 2)).toBe(false);
    pyramid[6]![3] = null;
    expect(isFree(pyramid, 5, 2)).toBe(true);
  });
});
