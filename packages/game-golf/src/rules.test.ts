import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { DECK, TABLEAU_COLUMNS, TABLEAU_ROWS, TABLEAU_SIZE } from './cards';
import { golfGame, leftoverOf, legalMovesFor } from './game';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [...state.stock, ...state.waste, ...state.tableau.flat()];
}

describe('Golf setup and stock', () => {
  it('deals seven columns of five, opens the hole, and leaves sixteen in stock', () => {
    const session = openSession(4_201);
    expect(session.state.tableau.map((column) => column.length)).toEqual(
      Array.from({ length: TABLEAU_COLUMNS }, () => TABLEAU_ROWS),
    );
    expect(session.state.waste).toHaveLength(1);
    expect(session.state.stock).toHaveLength(DECK.cardIds.length - TABLEAU_SIZE - 1);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(DECK.cardIds));
    expect(leftoverOf(session.state)).toBe(TABLEAU_SIZE);
    expect(() =>
      createSession(golfGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
  });

  it('turns one stock card onto the hole and never recycles', () => {
    const before = openSession(90);
    const next = before.state.stock.at(-1);
    const after = applyMove(before, { id: 'stock.draw' });
    expect(after.state.waste.at(-1)).toBe(next);
    expect(after.state.stock).toEqual(before.state.stock.slice(0, -1));
    expect(after.state.moves).toBe(1);
    expect(legalMovesFor(after.state).some((move) => move.id === 'stock.recycle')).toBe(false);
  });
});

describe('Golf moves', () => {
  it('plays a column foot onto a ±1 hole and exposes the card above it', () => {
    const state = emptyState({
      waste: ['H8'],
      tableau: [['S1', 'D5', 'C9'], [], [], [], [], [], []],
      stock: ['S2'],
    });
    const session = sessionWithState(state);
    const outcome = sessionApply(golfGame, session, 0, 'tableau.play', { from: 0 });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.waste.at(-1)).toBe('C9');
    expect(outcome.session.state.tableau[0]).toEqual(['S1', 'D5']);
    expect(outcome.session.state.moves).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toContain('golf.cards-move');
  });

  it('rejects same-rank, off-by-two, and Ace–King plays in Classic', () => {
    const state = emptyState({
      waste: ['H8'],
      tableau: [['C8'], ['S10'], ['S1'], ['S7'], [], [], []],
    });
    let session = sessionWithState(state);
    expect(sessionApply(golfGame, session, 0, 'tableau.play', { from: 0 }).rejected?.code).toBe(
      'bad-hole-target',
    );
    expect(sessionApply(golfGame, session, 0, 'tableau.play', { from: 1 }).rejected?.code).toBe(
      'bad-hole-target',
    );
    session = sessionWithState({
      ...state,
      waste: ['H13'],
      tableau: [['S1'], ['S12'], [], [], [], [], []],
    });
    expect(sessionApply(golfGame, session, 0, 'tableau.play', { from: 0 }).rejected?.code).toBe(
      'bad-hole-target',
    );
  });

  it('lets Ace and King wrap only under Fairway rules', () => {
    const state = emptyState({
      rules: { wrap: true },
      waste: ['H13'],
      tableau: [['S1'], ['C5'], [], [], [], [], []],
    });
    const outcome = sessionApply(golfGame, sessionWithState(state), 0, 'tableau.play', { from: 0 });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.waste.at(-1)).toBe('S1');
    expect(outcome.session.state.stage).toBe('holed');
    expect(outcome.session.state.tableau[1]).toEqual(['C5']);
  });

  it('clears the grass as a win and holes out when stock and plays are gone', () => {
    const cleared = sessionApply(
      golfGame,
      sessionWithState(
        emptyState({
          waste: ['H8'],
          tableau: [['S7'], [], [], [], [], [], []],
        }),
      ),
      0,
      'tableau.play',
      { from: 0 },
    );
    expect(cleared.session.state.stage).toBe('won');
    expect(cleared.session.result?.reason).toMatch(/cleared/);
    expect(cleared.fx.map((event) => event.kind)).toContain('golf.win');

    const stuck = sessionApply(
      golfGame,
      sessionWithState(
        emptyState({
          waste: ['H8'],
          tableau: [['S10'], [], [], [], [], [], []],
          stock: ['C2'],
        }),
      ),
      0,
      'stock.draw',
    );
    expect(stuck.session.state.stage).toBe('holed');
    expect(stuck.session.result?.rankings[0]?.detail).toMatchObject({
      leftover: 1,
      cleared: false,
    });
    expect(stuck.fx.map((event) => event.kind)).toContain('golf.hole-out');
  });
});
