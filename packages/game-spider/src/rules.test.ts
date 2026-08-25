import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { COLUMN_LENGTHS, deckFor } from './cards';
import { hintFor, legalMovesFor, spiderGame, spiderPlayerView } from './game';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [
    ...state.stock,
    ...state.tableau.flatMap((column) => [...column.down, ...column.up]),
    ...state.foundations.flat(),
  ];
}

describe('Spider setup and stock', () => {
  it('deals column lengths [6,6,6,6,5,5,5,5,5,5] with one up each and leaves 50 in stock', () => {
    const session = openSession(4_201);
    expect(session.state.tableau.map((column) => column.down.length + column.up.length)).toEqual([
      ...COLUMN_LENGTHS,
    ]);
    expect(session.state.tableau.map((column) => column.up.length)).toEqual(Array(10).fill(1));
    expect(session.state.tableau.map((column) => column.down.length)).toEqual([
      5, 5, 5, 5, 4, 4, 4, 4, 4, 4,
    ]);
    expect(session.state.stock).toHaveLength(50);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(deckFor(2).cardIds));
    expect(() =>
      createSession(spiderGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
  });

  it('blocks stock.deal while any column is empty', () => {
    const state = emptyState({
      stock: Array.from({ length: 10 }, (_, index) => `S${(index % 13) + 1}`),
    });
    state.tableau[0] = { down: [], up: [] };
    for (let column = 1; column < 10; column++) {
      state.tableau[column] = { down: [], up: [`H${column}`] };
    }
    const session = sessionWithState(state);
    expect(spiderGame.moves['stock.deal']?.validate(session.state, 0, undefined)).toEqual({
      code: 'empty-column',
      message: 'fill every column before dealing a row',
    });
    expect(legalMovesFor(session.state).some((move) => move.id === 'stock.deal')).toBe(false);
  });

  it('deals one face-up card onto every column from a full stock row', () => {
    const state = emptyState({
      stock: Array.from({ length: 10 }, (_, index) => `S${index + 1}`),
    });
    for (let column = 0; column < 10; column++) {
      state.tableau[column] = { down: [], up: [`H${(column % 13) + 1}`] };
    }
    const session = applyMove(sessionWithState(state), { id: 'stock.deal' });
    expect(session.state.stock).toEqual([]);
    expect(session.state.tableau.map((column) => column.up.at(-1))).toEqual([
      'S10',
      'S9',
      'S8',
      'S7',
      'S6',
      'S5',
      'S4',
      'S3',
      'S2',
      'S1',
    ]);
    expect(session.state.moves).toBe(1);
  });
});

describe('Spider moves', () => {
  it('clears a 1-suit King→Ace run as part of the same move and flips the newly exposed card', () => {
    const state = emptyState({ rules: { suitCount: 1 } });
    state.tableau[0] = {
      down: ['S1h'],
      up: ['S13', 'S12', 'S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2'],
    };
    state.tableau[1] = { down: [], up: ['S1'] };
    const outcome = sessionApply(spiderGame, sessionWithState(state), 0, 'tableau.move', {
      from: 1,
      card: 'S1',
      to: 0,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.foundations[0]).toEqual([
      'S13',
      'S12',
      'S11',
      'S10',
      'S9',
      'S8',
      'S7',
      'S6',
      'S5',
      'S4',
      'S3',
      'S2',
      'S1',
    ]);
    expect(outcome.session.state.tableau[0]).toEqual({ down: [], up: ['S1h'] });
    expect(outcome.session.state.tableau[1]).toEqual({ down: [], up: [] });
    expect(outcome.session.state.moves).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['spider.cards-move', 'spider.suit-clear', 'spider.tableau-flip']),
    );
  });

  it('rejects a 4-suit mixed-suit run moving as a unit', () => {
    const state = emptyState({ rules: { suitCount: 4 } });
    state.tableau[0] = { down: [], up: ['S13', 'H12'] };
    state.tableau[1] = { down: [], up: ['C13'] };
    const session = sessionWithState(state);
    expect(
      sessionApply(spiderGame, session, 0, 'tableau.move', {
        from: 0,
        card: 'S13',
        to: 1,
      }).rejected?.code,
    ).toBe('broken-run');
    expect(
      sessionApply(spiderGame, session, 0, 'tableau.move', {
        from: 0,
        card: 'H12',
        to: 1,
      }).rejected,
    ).toBeUndefined();
  });

  it('auto-flips the new top after moving the entire face-up run off a column', () => {
    const state = emptyState();
    state.tableau[0] = { down: ['D7'], up: ['S12', 'S11'] };
    state.tableau[1] = { down: [], up: ['H13'] };
    const outcome = sessionApply(spiderGame, sessionWithState(state), 0, 'tableau.move', {
      from: 0,
      card: 'S12',
      to: 1,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.tableau[0]).toEqual({ down: [], up: ['D7'] });
    expect(outcome.session.state.tableau[1]?.up).toEqual(['H13', 'S12', 'S11']);
    expect(outcome.session.state.moves).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toContain('spider.tableau-flip');
  });

  it('wins when the eighth suit reaches a foundation', () => {
    const state = emptyState({ stock: [] });
    for (let slot = 0; slot < 7; slot++) {
      state.foundations[slot] = Array.from({ length: 13 }, (_, index) => `S${13 - index}x${slot}`);
    }
    state.tableau[0] = {
      down: [],
      up: ['S13', 'S12', 'S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2'],
    };
    state.tableau[1] = { down: [], up: ['S1'] };
    const outcome = sessionApply(spiderGame, sessionWithState(state), 0, 'tableau.move', {
      from: 1,
      card: 'S1',
      to: 0,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stage).toBe('won');
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result).toMatchObject({ winner: 0, reason: 'solved in 1 moves' });
    expect(outcome.fx.map((event) => event.kind)).toContain('spider.win');
    expect(legalMovesFor(outcome.session.state)).toEqual([]);
    expect(hintFor(spiderPlayerView(outcome.session.state))).toBeNull();
  });
});

describe('public assistance', () => {
  it('chooses the same hint when only hidden identities change', () => {
    const left = emptyState({ stock: ['S9', 'D8'] });
    left.tableau[0] = { down: ['H4'], up: ['S5'] };
    left.tableau[1] = { down: [], up: ['H6'] };
    const right = emptyState({ stock: ['C2', 'H6b'] });
    right.tableau[0] = { down: ['D11'], up: ['S5'] };
    right.tableau[1] = { down: [], up: ['H6'] };
    expect(hintFor(spiderPlayerView(left))).toEqual(hintFor(spiderPlayerView(right)));
  });

  it('prefers completing a suit, then uncovering, then a same-suit build, then the stock', () => {
    const completing = emptyState();
    completing.tableau[0] = {
      down: [],
      up: ['S13', 'S12', 'S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2'],
    };
    completing.tableau[1] = { down: ['H2'], up: ['S1'] };
    expect(hintFor(spiderPlayerView(completing))?.move).toEqual({
      id: 'tableau.move',
      payload: { from: 1, card: 'S1', to: 0 },
    });

    const uncover = emptyState();
    uncover.tableau[0] = { down: ['S2'], up: ['S12'] };
    uncover.tableau[1] = { down: [], up: ['H13'] };
    expect(hintFor(spiderPlayerView(uncover))?.reason).toMatch(/turn a hidden card/);

    const suited = emptyState();
    suited.tableau[0] = { down: [], up: ['S8'] };
    suited.tableau[1] = { down: [], up: ['S9'] };
    suited.tableau[2] = { down: [], up: ['H9'] };
    expect(hintFor(spiderPlayerView(suited))?.move).toEqual({
      id: 'tableau.move',
      payload: { from: 0, card: 'S8', to: 1 },
    });

    const dealOnly = emptyState({
      stock: Array.from({ length: 10 }, (_, index) => `S${index + 1}`),
    });
    const stuckTops = ['S7', 'S7b', 'S7c', 'S7d', 'H7', 'H7b', 'H7c', 'H7d', 'S9', 'H9'];
    for (let column = 0; column < 10; column++) {
      dealOnly.tableau[column] = { down: [], up: [stuckTops[column] as string] };
    }
    expect(hintFor(spiderPlayerView(dealOnly))).toEqual({
      move: { id: 'stock.deal' },
      reason: 'Deal the last row from the stock.',
    });
  });
});

describe('seats', () => {
  it('is a one-seat game', () => {
    expect(openSession().seats).toBe(1);
    expect(spiderGame.flow.legalMovesFor?.(openSession().state, openSession().phase, 1)).toEqual(
      [],
    );
  });
});
