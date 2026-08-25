import type { LegalMove } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import type { FreecellTableView } from './view';
import { describeHint, moveForTarget, selectionForCard, targetsForSelection } from './view';

function view(legal: readonly LegalMove[]): FreecellTableView {
  return {
    mode: 'daily',
    dailyKey: '2026-08-24',
    stage: 'playing',
    freeCells: 4,
    moves: 0,
    cells: [null, null, null, null],
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    tableau: [['S13', 'H12'], ['C13'], ...Array.from({ length: 6 }, () => [])],
    legal,
    canUndo: false,
    canFinish: false,
    hint: null,
  };
}

describe('FreeCell table selection', () => {
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

  it('selects a free-cell card onto a foundation', () => {
    const legal = [{ id: 'cell.toFoundation', payload: { from: 1 } }] satisfies LegalMove[];
    const table = {
      ...view(legal),
      cells: [null, 'H1', null, null],
    };
    const selection = selectionForCard(table, 'cell:1', 'H1');
    expect(selection).toEqual({ from: 'cell:1', card: 'H1', count: 1 });
    expect(targetsForSelection(table, selection)).toEqual(['foundation:hearts']);
  });

  it('does not turn an inert public card into a fake source', () => {
    expect(selectionForCard(view([]), 'tableau:0', 'S13')).toBeNull();
  });
});

describe('FreeCell hint copy', () => {
  it('shows the spoken reason without zone ids', () => {
    const table = view([]);
    expect(
      describeHint(
        {
          move: { id: 'tableau.move', payload: { from: 0, card: 'D13', to: 1 } },
          reason: 'Move the King of diamonds onto the Queen of clubs.',
        },
        table,
      ),
    ).toBe('Move the King of diamonds onto the Queen of clubs.');
    expect(describeHint(null, table)).toBeNull();
  });
});
