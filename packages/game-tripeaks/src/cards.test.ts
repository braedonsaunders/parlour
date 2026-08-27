import { describe, expect, it } from 'vitest';
import {
  canPlayOnHole,
  emptyTableau,
  isFree,
  rankOfCard,
  suitOfCard,
  TABLEAU_CHILDREN,
} from './cards';

describe('TriPeaks card rules', () => {
  it('reads standard-deck ranks A=1 through K=13', () => {
    expect(rankOfCard('S1')).toBe(1);
    expect(rankOfCard('H10')).toBe(10);
    expect(rankOfCard('D11')).toBe(11);
    expect(rankOfCard('C12')).toBe(12);
    expect(rankOfCard('S13')).toBe(13);
    expect(suitOfCard('H12')).toBe('hearts');
  });

  it('locks the peaks child map: base row free, peaks covered by two children', () => {
    expect(TABLEAU_CHILDREN).toHaveLength(18);
    expect(TABLEAU_CHILDREN[0]).toEqual([3, 4]);
    expect(TABLEAU_CHILDREN[1]).toEqual([5, 6]);
    expect(TABLEAU_CHILDREN[2]).toEqual([7, 8]);
    expect(TABLEAU_CHILDREN[3]).toEqual([9, 10]);
    expect(TABLEAU_CHILDREN[4]).toEqual([10, 11]);
    expect(TABLEAU_CHILDREN[5]).toEqual([12, 13]);
    expect(TABLEAU_CHILDREN[6]).toEqual([13, 14]);
    expect(TABLEAU_CHILDREN[7]).toEqual([15, 16]);
    expect(TABLEAU_CHILDREN[8]).toEqual([16, 17]);
    for (let index = 9; index < 18; index++) {
      expect(TABLEAU_CHILDREN[index]).toEqual([]);
    }
  });

  it('frees a card only once both children are gone, and the base is always free', () => {
    const tableau = emptyTableau();
    tableau[0] = 'S7';
    tableau[3] = 'H1';
    tableau[4] = 'D12';
    for (let index = 9; index < 18; index++) tableau[index] = 'C2';
    expect(isFree(tableau, 9)).toBe(true);
    expect(isFree(tableau, 0)).toBe(false);
    tableau[3] = null;
    expect(isFree(tableau, 0)).toBe(false);
    tableau[4] = null;
    expect(isFree(tableau, 0)).toBe(true);
    expect(isFree(tableau, 1)).toBe(false);
  });

  it('plays a card one rank from the hole, wrapping Ace/King only when enabled', () => {
    expect(canPlayOnHole('S7', 'H8', false)).toBe(true);
    expect(canPlayOnHole('S7', 'H9', false)).toBe(false);
    expect(canPlayOnHole('S1', 'H13', false)).toBe(false);
    expect(canPlayOnHole('S1', 'H13', true)).toBe(true);
    expect(canPlayOnHole('S13', 'H1', true)).toBe(true);
  });
});
