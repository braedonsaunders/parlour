import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import type { SpiderTableView } from './view';
import { describeHint, moveForTarget, selectionForCard, targetsForSelection } from './view';

function view(legal: readonly LegalMove[]): SpiderTableView {
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    suitCount: 2,
    moves: 0,
    stockCount: 50,
    stockDeals: 5,
    foundations: Array.from({ length: 8 }, () => []),
    tableau: [
      { down: [], up: ['S13', 'S12'] },
      { down: [], up: ['H13'] },
      ...Array.from({ length: 8 }, () => ({ down: [], up: [] })),
    ],
    legal,
    canUndo: false,
    undoDepth: 0,
    canFinish: false,
    hint: null,
  };
}

describe('Spider table selection', () => {
  it('selects a same-suit suffix and resolves only its legal target', () => {
    const legal = [
      { id: 'tableau.move', payload: { from: 0, card: 'S12', to: 1 } },
    ] satisfies LegalMove[];
    const table = view(legal);
    const selection = selectionForCard(table, 'tableau:0', 'S12');
    expect(selection).toEqual({ from: 'tableau:0', card: 'S12', count: 1 });
    expect(targetsForSelection(table, selection)).toEqual(['tableau:1']);
    expect(moveForTarget(table, selection!, 'tableau:1')).toEqual(legal[0]);
    expect(moveForTarget(table, selection!, 'tableau:2')).toBeNull();
  });

  it('does not turn an inert public card into a fake source', () => {
    expect(selectionForCard(view([{ id: 'stock.deal' }]), 'tableau:0', 'S13')).toBeNull();
  });
});

describe('Spider hint copy', () => {
  it('shows the spoken reason without zone ids', () => {
    const table = view([]);
    expect(
      describeHint(
        {
          move: { id: 'tableau.move', payload: { from: 0, card: 'S13', to: 2 } },
          reason: 'Move the King of spades to an empty column to turn a hidden card.',
        },
        table,
      ),
    ).toBe('Move the King of spades to an empty column to turn a hidden card.');
    expect(describeHint(null, table)).toBeNull();
  });
});
