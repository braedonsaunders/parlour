import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { COLUMN_LENGTHS, DECK, SUITS } from './cards';
import { canAutoFinish, freecellGame, freecellPlayerView, legalMovesFor } from './game';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [
    ...state.tableau.flat(),
    ...state.cells.filter((card): card is string => card !== null),
    ...SUITS.flatMap((suit) => state.foundations[suit]),
  ];
}

describe('FreeCell setup and deal', () => {
  it('deals 52 unique cards into columns 7,7,7,7,6,6,6,6 and four empty cells', () => {
    const session = openSession(4_201);
    expect(session.state.tableau.map((column) => column.length)).toEqual([...COLUMN_LENGTHS]);
    expect(session.state.cells).toEqual([null, null, null, null]);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(DECK.cardIds));
    expect(allStateCards(session.state)).toHaveLength(52);
    expect(() =>
      createSession(freecellGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
  });

  it('opens Relaxed with six empty free cells', () => {
    const session = openSession(11, { freeCells: 6 });
    expect(session.state.cells).toHaveLength(6);
    expect(session.state.cells.every((cell) => cell === null)).toBe(true);
    expect(session.state.tableau.map((column) => column.length)).toEqual([...COLUMN_LENGTHS]);
  });
});

describe('FreeCell moves', () => {
  it('refuses an over-long run and allows a 2-card run with one empty cell', () => {
    const blocked = emptyState();
    blocked.tableau = [
      ['H12', 'S11', 'D10'],
      ['C13'],
      ['S2'],
      ['H2'],
      ['D2'],
      ['C2'],
      ['S3'],
      ['H3'],
    ];
    blocked.cells = ['D5', 'D6', 'D7', 'D8'];
    expect(
      sessionApply(freecellGame, sessionWithState(blocked), 0, 'tableau.move', {
        from: 0,
        card: 'H12',
        to: 1,
      }).rejected?.code,
    ).toBe('supermove-limit');

    const allowed = emptyState();
    allowed.tableau = [['H12', 'S11'], ['C13'], ['S2'], ['H2'], ['D2'], ['C2'], ['S3'], ['H3']];
    allowed.cells = [null, 'D5', 'D6', 'D7'];
    const outcome = sessionApply(freecellGame, sessionWithState(allowed), 0, 'tableau.move', {
      from: 0,
      card: 'H12',
      to: 1,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.tableau[1]).toEqual(['C13', 'H12', 'S11']);
    expect(outcome.session.state.tableau[0]).toEqual([]);
  });

  it('does not count an empty destination column as a supermove helper', () => {
    const state = emptyState();
    state.tableau = [['H12', 'S11'], [], ['S2'], ['H2'], ['D2'], ['C2'], ['S3'], ['H3']];
    state.cells = ['D5', 'D6', 'D7', 'D8'];
    expect(
      sessionApply(freecellGame, sessionWithState(state), 0, 'tableau.move', {
        from: 0,
        card: 'H12',
        to: 1,
      }).rejected?.code,
    ).toBe('supermove-limit');
  });

  it('lets any card enter an empty tableau column', () => {
    const state = emptyState();
    state.tableau[0] = ['S5'];
    state.tableau[1] = [];
    const outcome = sessionApply(freecellGame, sessionWithState(state), 0, 'tableau.move', {
      from: 0,
      card: 'S5',
      to: 1,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.tableau[1]).toEqual(['S5']);
  });

  it('builds foundations Ace through King and allows a foundation worry-back', () => {
    const state = emptyState();
    state.cells = ['H1', null, null, null];
    state.tableau[0] = ['H2'];
    let session = sessionWithState(state);
    session = applyMove(session, { id: 'cell.toFoundation', payload: { from: 0 } });
    session = applyMove(session, { id: 'tableau.toFoundation', payload: { from: 0 } });
    expect(session.state.foundations.hearts).toEqual(['H1', 'H2']);

    const worry = emptyState();
    worry.foundations.hearts = Array.from({ length: 12 }, (_, index) => `H${index + 1}`);
    worry.tableau[1] = ['C13'];
    session = sessionWithState(worry);
    session = applyMove(session, {
      id: 'foundation.toTableau',
      payload: { suit: 'hearts', to: 1 },
    });
    expect(session.state.foundations.hearts).toHaveLength(11);
    expect(session.state.tableau[1]?.at(-1)).toBe('H12');
  });

  it('parks a tableau top in a free cell and can move cell to cell', () => {
    const state = emptyState();
    state.tableau[0] = ['S9'];
    let session = sessionWithState(state);
    session = applyMove(session, { id: 'tableau.toCell', payload: { from: 0, to: 1 } });
    expect(session.state.cells[1]).toBe('S9');
    session = applyMove(session, { id: 'cell.toCell', payload: { from: 1, to: 3 } });
    expect(session.state.cells[3]).toBe('S9');
    expect(session.state.cells[1]).toBeNull();
  });

  it('wins as the 52nd card reaches a foundation', () => {
    const state = emptyState();
    state.cells = ['S13', null, null, null];
    for (const suit of ['hearts', 'diamonds', 'clubs'] as const) {
      const prefix = suit === 'hearts' ? 'H' : suit === 'diamonds' ? 'D' : 'C';
      state.foundations[suit] = Array.from({ length: 13 }, (_, index) => `${prefix}${index + 1}`);
    }
    state.foundations.spades = Array.from({ length: 12 }, (_, index) => `S${index + 1}`);
    const outcome = sessionApply(freecellGame, sessionWithState(state), 0, 'cell.toFoundation', {
      from: 0,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stage).toBe('won');
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result).toMatchObject({ winner: 0, reason: 'solved in 1 moves' });
    expect(outcome.fx.map((event) => event.kind)).toContain('freecell.win');
    const won = freecellPlayerView(outcome.session.state);
    expect(legalMovesFor(outcome.session.state)).toEqual([]);
    expect(canAutoFinish(won)).toBe(false);
  });

  it('only offers auto-finish when ordinary foundation walks clear the table', () => {
    const state = emptyState();
    for (const suit of SUITS) {
      const prefix =
        suit === 'spades' ? 'S' : suit === 'hearts' ? 'H' : suit === 'diamonds' ? 'D' : 'C';
      state.foundations[suit] = Array.from({ length: 12 }, (_, index) => `${prefix}${index + 1}`);
    }
    state.tableau[0] = ['S13'];
    state.tableau[1] = ['H13'];
    state.cells = ['D13', 'C13', null, null];
    expect(canAutoFinish(freecellPlayerView(state))).toBe(true);
    state.tableau[2] = ['S5'];
    expect(canAutoFinish(freecellPlayerView(state))).toBe(false);
  });
});

describe('public copies', () => {
  it('returns a playerView that is a structural copy', () => {
    const session = openSession(19);
    const view = freecellPlayerView(session.state);
    expect(view).not.toBe(session.state);
    expect(view.tableau).not.toBe(session.state.tableau);
    expect(view.tableau[0]).not.toBe(session.state.tableau[0]);
    expect(view.cells).not.toBe(session.state.cells);
    expect(view.foundations.spades).not.toBe(session.state.foundations.spades);
    view.tableau[0]?.push('XX');
    expect(session.state.tableau[0]?.includes('XX')).toBe(false);
  });
});
