import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { DECK, SUITS } from './cards';
import { canAutoFinish, hintFor, klondikeGame, klondikePlayerView, legalMovesFor } from './game';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.tableau.flatMap((column) => [...column.down, ...column.up]),
    ...SUITS.flatMap((suit) => state.foundations[suit]),
  ];
}

describe('Klondike setup and stock', () => {
  it('deals 1..7 tableau cards with one up each and leaves 24 in stock', () => {
    const session = openSession(4_201);
    expect(session.state.tableau.map((column) => column.down.length + column.up.length)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(session.state.tableau.map((column) => column.up.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(session.state.stock).toHaveLength(24);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(DECK.cardIds));
    expect(() =>
      createSession(klondikeGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
  });

  it('turns three in order and recycles the waste without shuffling or a pass limit', () => {
    let session = openSession(90);
    const initialStock = session.state.stock.slice();
    session = applyMove(session, { id: 'stock.draw' });
    expect(session.state.waste).toEqual(initialStock.slice(-3).reverse());
    expect(session.state.stock).toEqual(initialStock.slice(0, -3));
    expect(session.state.moves).toBe(1);

    while (session.state.stock.length > 0) session = applyMove(session, { id: 'stock.draw' });
    const waste = session.state.waste.slice();
    session = applyMove(session, { id: 'stock.recycle' });
    expect(session.state.stock).toEqual(waste.reverse());
    expect(session.state.waste).toEqual([]);
    expect(session.state.recycles).toBe(1);
    expect(session.state.moves).toBe(9);
  });

  it('turns one in Relaxed rules', () => {
    const before = openSession(91, { drawCount: 1 });
    const after = applyMove(before, { id: 'stock.draw' });
    expect(before.state.stock.length - after.state.stock.length).toBe(1);
    expect(after.state.waste).toHaveLength(1);
  });

  it('turns a final partial Draw Three batch and exposes the next waste card after removal', () => {
    const state = emptyState({ stock: ['C1', 'D2'], waste: ['S5'] });
    let session = sessionWithState(state);
    session = applyMove(session, { id: 'stock.draw' });
    expect(session.state.stock).toEqual([]);
    expect(session.state.waste).toEqual(['S5', 'D2', 'C1']);
    session = applyMove(session, { id: 'waste.toFoundation' });
    expect(session.state.foundations.clubs).toEqual(['C1']);
    expect(session.state.waste.at(-1)).toBe('D2');
  });

  it('preserves stock order over repeated recycles without resurrecting a removed waste card', () => {
    const state = emptyState({ waste: ['S9', 'H8', 'C7'] });
    state.tableau[0] = { down: [], up: ['D8'] };
    let session = sessionWithState(state);
    session = applyMove(session, { id: 'stock.recycle' });
    expect(session.state.stock).toEqual(['C7', 'H8', 'S9']);
    session = applyMove(session, { id: 'stock.draw' });
    expect(session.state.waste).toEqual(['S9', 'H8', 'C7']);
    session = applyMove(session, { id: 'waste.toTableau', payload: { to: 0 } });
    session = applyMove(session, { id: 'stock.recycle' });
    expect(session.state.stock).toEqual(['H8', 'S9']);
    expect([...session.state.stock, ...session.state.waste]).not.toContain('C7');
    session = applyMove(session, { id: 'stock.draw' });
    expect(session.state.waste).toEqual(['S9', 'H8']);
    expect(session.state.tableau[0]?.up.at(-1)).toBe('C7');
  });
});

describe('Klondike moves', () => {
  it('moves a packed suffix and auto-flips the newly exposed down card in one action', () => {
    const state = emptyState();
    state.tableau[0] = { down: ['D7'], up: ['C12', 'H11'] };
    state.tableau[1] = { down: [], up: ['D13'] };
    const session = sessionWithState(state);
    const outcome = sessionApply(klondikeGame, session, 0, 'tableau.move', {
      from: 0,
      card: 'C12',
      to: 1,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.tableau[0]).toEqual({ down: [], up: ['D7'] });
    expect(outcome.session.state.tableau[1]?.up).toEqual(['D13', 'C12', 'H11']);
    expect(outcome.session.state.moves).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toContain('klondike.tableau-flip');
  });

  it('rejects broken runs, same-color builds and non-Kings in empty columns', () => {
    const state = emptyState();
    state.tableau[0] = { down: [], up: ['C12', 'S11'] };
    state.tableau[1] = { down: [], up: ['H13'] };
    state.tableau[2] = { down: [], up: [] };
    let session = sessionWithState(state);
    expect(
      sessionApply(klondikeGame, session, 0, 'tableau.move', {
        from: 0,
        card: 'C12',
        to: 1,
      }).rejected?.code,
    ).toBe('broken-run');
    expect(
      sessionApply(klondikeGame, session, 0, 'tableau.move', {
        from: 0,
        card: 'S11',
        to: 2,
      }).rejected?.code,
    ).toBe('bad-tableau-target');
    state.tableau[0] = { down: [], up: ['C13'] };
    session = sessionWithState(state);
    expect(
      sessionApply(klondikeGame, session, 0, 'tableau.move', {
        from: 0,
        card: 'C13',
        to: 2,
      }).rejected,
    ).toBeUndefined();
  });

  it('moves waste and tableau tops to foundations and allows a foundation worry-back', () => {
    const state = emptyState({ waste: ['H1'] });
    state.tableau[0] = { down: ['S8'], up: ['H2'] };
    let session = sessionWithState(state);
    session = applyMove(session, { id: 'waste.toFoundation' });
    session = applyMove(session, { id: 'tableau.toFoundation', payload: { from: 0 } });
    expect(session.state.foundations.hearts).toEqual(['H1', 'H2']);
    expect(session.state.tableau[0]).toEqual({ down: [], up: ['S8'] });

    const worry = emptyState();
    worry.foundations.hearts = Array.from({ length: 12 }, (_, index) => `H${index + 1}`);
    worry.tableau[1] = { down: [], up: ['C13'] };
    session = sessionWithState(worry);
    session = applyMove(session, {
      id: 'foundation.toTableau',
      payload: { suit: 'hearts', to: 1 },
    });
    expect(session.state.foundations.hearts).toHaveLength(11);
    expect(session.state.tableau[1]?.up.at(-1)).toBe('H12');
  });

  it('wins as the 52nd card reaches a foundation', () => {
    const state = emptyState({ waste: ['S13'] });
    for (const suit of ['hearts', 'diamonds', 'clubs'] as const) {
      const prefix = suit === 'hearts' ? 'H' : suit === 'diamonds' ? 'D' : 'C';
      state.foundations[suit] = Array.from({ length: 13 }, (_, index) => `${prefix}${index + 1}`);
    }
    state.foundations.spades = Array.from({ length: 12 }, (_, index) => `S${index + 1}`);
    const outcome = sessionApply(klondikeGame, sessionWithState(state), 0, 'waste.toFoundation');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stage).toBe('won');
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result).toMatchObject({ winner: 0, reason: 'solved in 1 moves' });
    expect(outcome.fx.map((event) => event.kind)).toContain('klondike.win');
    const won = klondikePlayerView(outcome.session.state);
    expect(legalMovesFor(outcome.session.state)).toEqual([]);
    expect(canAutoFinish(won)).toBe(false);
    expect(hintFor(won)).toBeNull();
  });
});

describe('public assistance', () => {
  it('chooses the same hint when only hidden identities change', () => {
    const left = emptyState({ stock: ['S9', 'D8'] });
    left.tableau[0] = { down: ['H4'], up: ['C13'] };
    const right = emptyState({ stock: ['C2', 'H6'] });
    right.tableau[0] = { down: ['D11'], up: ['C13'] };
    expect(hintFor(klondikePlayerView(left))).toEqual(hintFor(klondikePlayerView(right)));
  });

  it('only offers auto-finish when every hidden card is open and ordinary foundation moves finish', () => {
    const state = emptyState();
    for (const suit of SUITS) {
      const prefix =
        suit === 'spades' ? 'S' : suit === 'hearts' ? 'H' : suit === 'diamonds' ? 'D' : 'C';
      state.foundations[suit] = Array.from({ length: 12 }, (_, index) => `${prefix}${index + 1}`);
    }
    state.tableau[0]?.up.push('S13');
    state.tableau[1]?.up.push('H13');
    state.tableau[2]?.up.push('D13');
    state.tableau[3]?.up.push('C13');
    expect(canAutoFinish(klondikePlayerView(state))).toBe(true);
    state.stock.push('??');
    expect(canAutoFinish(klondikePlayerView(state))).toBe(false);
  });
});
