import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import {
  cardOfMove,
  playableColumns,
  sourceOfMove,
  targetOfMove,
  type GolfTableView,
} from './view';

function view(legal: readonly LegalMove[]): GolfTableView {
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    wrap: false,
    moves: 0,
    leftover: 2,
    stockCount: 16,
    waste: ['H8'],
    tableau: [['S7'], ['C10'], [], [], [], [], []],
    legal,
    canUndo: false,
    hint: null,
  };
}

describe('Golf table view', () => {
  it('maps a column foot onto the hole and ignores inert columns', () => {
    const legal = [{ id: 'tableau.play', payload: { from: 0 } }] satisfies LegalMove[];
    const table = view(legal);
    expect(sourceOfMove(legal[0]!)).toBe('tableau:0');
    expect(targetOfMove(legal[0]!)).toBe('waste');
    expect(cardOfMove(legal[0]!, table)).toBe('S7');
    expect(playableColumns(table)).toEqual([0]);
  });

  it('treats a stock turn as hole-bound', () => {
    expect(sourceOfMove({ id: 'stock.draw' })).toBe('stock');
    expect(targetOfMove({ id: 'stock.draw' })).toBe('waste');
  });
});
