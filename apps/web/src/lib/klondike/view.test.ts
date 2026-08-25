import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import type { KlondikeTableView } from './view';
import { describeHint, moveForTarget, selectionForCard, targetsForSelection } from './view';

function view(legal: readonly LegalMove[]): KlondikeTableView {
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    drawCount: 3,
    moves: 0,
    recycles: 0,
    stockCount: 24,
    waste: ['H12'],
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    tableau: [
      { down: [], up: ['S13', 'H12'] },
      { down: [], up: ['C13'] },
      ...Array.from({ length: 5 }, () => ({ down: [], up: [] })),
    ],
    legal,
    canUndo: false,
    canFinish: false,
    hint: null,
  };
}

describe('Klondike table selection', () => {
  it('selects a face-up suffix and resolves only its legal target', () => {
    const legal = [
      { id: 'tableau.move', payload: { from: 0, card: 'H12', to: 1 } },
    ] satisfies LegalMove[];
    const table = view(legal);
    const selection = selectionForCard(table, 'tableau:0', 'H12');
    expect(selection).toEqual({ from: 'tableau:0', card: 'H12', count: 1 });
    expect(targetsForSelection(table, selection)).toEqual(['tableau:1']);
    expect(moveForTarget(table, selection!, 'tableau:1')).toEqual(legal[0]);
    expect(moveForTarget(table, selection!, 'tableau:2')).toBeNull();
  });

  it('does not turn an inert public card into a fake source', () => {
    expect(selectionForCard(view([{ id: 'stock.draw' }]), 'tableau:0', 'S13')).toBeNull();
  });
});

describe('Klondike hint copy', () => {
  it('shows the spoken reason without zone ids', () => {
    const table = view([]);
    expect(
      describeHint(
        {
          move: { id: 'tableau.move', payload: { from: 0, card: 'D13', to: 1 } },
          reason: 'Move the King of diamonds to an empty column to turn a hidden card.',
        },
        table,
      ),
    ).toBe('Move the King of diamonds to an empty column to turn a hidden card.');
    expect(describeHint(null, table)).toBeNull();
  });
});
