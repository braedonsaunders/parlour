import { describe, expect, it } from 'vitest';
import { hintFor, freecellPlayerView } from './game';
import { emptyState, isolate } from './test-util';

describe('FreeCell greedy hints', () => {
  it('prefers a foundation move over a tableau build', () => {
    const state = emptyState();
    state.cells = ['H1', null, null, null];
    state.tableau[0] = ['S9'];
    state.tableau[1] = ['D8'];
    const hint = hintFor(freecellPlayerView(isolate(state)));
    expect(hint?.move).toEqual({ id: 'cell.toFoundation', payload: { from: 0 } });
    expect(hint?.reason).toBe('Put the Ace of hearts up to free a cell.');
  });

  it('prefers freeing a cell over a mere tableau build', () => {
    const state = emptyState();
    state.cells = ['H8', 'D2', 'D3', 'D4'];
    state.tableau[0] = ['S9'];
    state.tableau[1] = ['H7'];
    state.tableau[2] = ['C5'];
    const hint = hintFor(freecellPlayerView(state));
    expect(hint?.move.id).toBe('cell.toTableau');
    expect(hint?.reason).toBe('Play the 8 of hearts from a free cell onto the 9 of spades.');
  });

  it('names a tableau build when nothing better is available', () => {
    const state = emptyState();
    state.tableau[0] = ['H8'];
    state.tableau[1] = ['S9'];
    const hint = hintFor(freecellPlayerView(isolate(state)));
    expect(hint?.move).toEqual({
      id: 'tableau.move',
      payload: { from: 0, card: 'H8', to: 1 },
    });
    expect(hint?.reason).toBe('Move the 8 of hearts onto the 9 of spades to clear a column.');
  });

  it('does not offer a foundation unwind or a cell-to-cell shuffle', () => {
    const state = emptyState();
    state.foundations.hearts = ['H1'];
    state.tableau = [['S2'], ['C10'], ['D10'], ['S10'], ['H10'], ['C8'], ['D8'], ['S8']];
    state.cells = ['C5', 'D5', 'S5', 'H5'];
    expect(hintFor(freecellPlayerView(state))).toBeNull();

    const shuffle = emptyState();
    shuffle.tableau = [['C10'], ['D10'], ['S10'], ['H10'], ['C8'], ['D8'], ['S8'], ['H8']];
    shuffle.cells = ['S5', 'C5', 'D4', 'H4'];
    expect(hintFor(freecellPlayerView(shuffle))).toBeNull();
  });

  it('does not slide an entire column onto another empty column', () => {
    const state = emptyState();
    state.tableau = [['D13', 'C12'], ['S10'], ['H10'], ['C10'], ['D10'], ['S8'], ['H8'], ['C8']];
    state.cells = ['S5', 'H5', 'C5', 'D5'];
    expect(hintFor(freecellPlayerView(state))).toBeNull();
  });
});
