import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { clickSource, partnersOf, type PyramidTableView } from './view';

function view(legal: readonly LegalMove[]): PyramidTableView {
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    recyclesLimit: 2,
    moves: 0,
    recycles: 0,
    leftover: 4,
    stockCount: 24,
    waste: ['H1'],
    pyramid: [
      [null],
      [null, null],
      [null, null, null],
      [null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null, null],
      ['S12', 'D13', 'C3', null, null, null, null],
    ],
    legal,
    canUndo: false,
    hint: null,
  };
}

describe('Pyramid table view', () => {
  it('removes a King on the first click', () => {
    const legal = [
      { id: 'pyramid.remove', payload: { from: { row: 6, col: 1 } } },
    ] satisfies LegalMove[];
    expect(clickSource(view(legal), null, { row: 6, col: 1 })).toEqual({
      selection: null,
      move: legal[0],
    });
  });

  it('selects a free card, then completes a pair or deselects', () => {
    const legal = [
      {
        id: 'pyramid.pair',
        payload: { a: { row: 6, col: 0 }, b: 'waste' },
      },
    ] satisfies LegalMove[];
    const table = view(legal);
    expect(clickSource(table, null, { row: 6, col: 0 })).toEqual({
      selection: { row: 6, col: 0 },
      move: null,
    });
    expect(clickSource(table, { row: 6, col: 0 }, 'waste')).toEqual({
      selection: null,
      move: legal[0],
    });
    expect(clickSource(table, { row: 6, col: 0 }, { row: 6, col: 0 })).toEqual({
      selection: null,
      move: null,
    });
  });

  it('names the waste as a partner of a selected pyramid card', () => {
    const legal = [
      {
        id: 'pyramid.pair',
        payload: { a: { row: 6, col: 0 }, b: 'waste' },
      },
    ] satisfies LegalMove[];
    expect(partnersOf(view(legal), { row: 6, col: 0 })).toEqual(['waste']);
    expect(partnersOf(view(legal), 'waste')).toEqual([{ row: 6, col: 0 }]);
    expect(partnersOf(view(legal), { row: 6, col: 2 })).toEqual([]);
  });
});
