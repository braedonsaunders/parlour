import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import {
  cardOfMove,
  clickTableau,
  freeIndices,
  playableIndices,
  sourceOfMove,
  targetOfMove,
  type TripeaksTableView,
} from './view';

function view(legal: readonly LegalMove[]): TripeaksTableView {
  const tableau: (string | null)[] = Array.from({ length: 18 }, () => null);
  tableau[9] = 'S7';
  tableau[0] = 'D5';
  tableau[3] = 'H2';
  tableau[4] = 'C3';
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    wrap: false,
    recycle: false,
    moves: 0,
    recycles: 0,
    leftover: 4,
    stockCount: 16,
    hole: ['H8'],
    tableau,
    legal,
    canUndo: false,
    undoDepth: 0,
    hint: null,
  };
}

describe('TriPeaks table view', () => {
  it('maps a free tableau card onto the hole and dispatches on a matching tap', () => {
    const legal = [{ id: 'tableau.play', payload: { from: 9 } }] satisfies LegalMove[];
    const table = view(legal);
    expect(sourceOfMove(legal[0]!)).toBe('tableau:9');
    expect(targetOfMove(legal[0]!)).toBe('hole');
    expect(cardOfMove(legal[0]!, table)).toBe('S7');
    expect(playableIndices(table)).toEqual([9]);
    expect(clickTableau(table, 9)).toEqual(legal[0]);
    expect(clickTableau(table, 0)).toBeNull();
  });

  it('treats a stock flip as hole-bound and a recycle as stock-bound', () => {
    expect(sourceOfMove({ id: 'stock.flip' })).toBe('stock');
    expect(targetOfMove({ id: 'stock.flip' })).toBe('hole');
    expect(sourceOfMove({ id: 'stock.recycle' })).toBe('hole');
    expect(targetOfMove({ id: 'stock.recycle' })).toBe('stock');
  });

  it('reports free slots even when they do not currently fit the hole', () => {
    const table = view([]);
    // Base row (9-17) is always free; index 0 is covered by 3 and 4.
    expect(freeIndices(table)).toEqual(expect.arrayContaining([9]));
    expect(freeIndices(table)).not.toEqual(expect.arrayContaining([0]));
  });
});
