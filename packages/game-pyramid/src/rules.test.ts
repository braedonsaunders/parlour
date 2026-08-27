import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { DECK, PYRAMID_ROWS, PYRAMID_SIZE, STOCK_SIZE } from './cards';
import { hintFor, leftoverOf, legalMovesFor, pyramidGame, pyramidPlayerView } from './game';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.pyramid.flat().filter((card): card is string => card !== null),
  ];
}

describe('Pyramid setup and stock', () => {
  it('deals 28 pyramid cards in rows 1..7 and leaves 24 in stock', () => {
    const session = openSession(4_201);
    expect(session.state.pyramid.map((row) => row.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(session.state.pyramid.flat().every((card) => card !== null)).toBe(true);
    expect(session.state.waste).toEqual([]);
    expect(session.state.stock).toHaveLength(STOCK_SIZE);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(DECK.cardIds));
    expect(leftoverOf(session.state)).toBe(DECK.cardIds.length);
    expect(() =>
      createSession(pyramidGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
    expect((PYRAMID_ROWS * (PYRAMID_ROWS + 1)) / 2).toBe(PYRAMID_SIZE);
  });

  it('turns one stock card onto an empty waste, then recycles without shuffling', () => {
    const before = openSession(90);
    const next = before.state.stock.at(-1);
    const after = applyMove(before, { id: 'stock.draw' });
    expect(after.state.waste.at(-1)).toBe(next);
    expect(after.state.stock).toEqual(before.state.stock.slice(0, -1));
    expect(after.state.moves).toBe(1);
    expect(leftoverOf(after.state)).toBe(leftoverOf(before.state));

    let session = after;
    while (session.state.stock.length > 0) session = applyMove(session, { id: 'stock.draw' });
    const waste = session.state.waste.slice();
    session = applyMove(session, { id: 'stock.recycle' });
    expect(session.state.stock).toEqual(waste.slice().reverse());
    expect(session.state.waste).toEqual([]);
    expect(session.state.recycles).toBe(1);
  });
});

describe('Pyramid moves', () => {
  it('removes a free King alone and pairs Queen with Ace', () => {
    const king = emptyState();
    king.pyramid[6]![0] = 'S13';
    const removed = sessionApply(pyramidGame, sessionWithState(king), 0, 'pyramid.remove', {
      from: { row: 6, col: 0 },
    });
    expect(removed.rejected).toBeUndefined();
    expect(removed.session.state.pyramid[6]![0]).toBeNull();
    expect(removed.fx.map((event) => event.kind)).toContain('pyramid.remove');

    const wasteKing = emptyState({ waste: ['H4', 'D13'] });
    const wasteRemoved = sessionApply(
      pyramidGame,
      sessionWithState(wasteKing),
      0,
      'pyramid.remove',
      { from: 'waste' },
    );
    expect(wasteRemoved.rejected).toBeUndefined();
    expect(wasteRemoved.session.state.waste).toEqual(['H4']);
    expect(wasteRemoved.fx).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'card.fly',
          payload: expect.objectContaining({ card: 'D13', from: 'waste', to: 'waste' }),
        }),
      ]),
    );

    const pair = emptyState();
    pair.pyramid[6]![0] = 'H12';
    pair.pyramid[6]![1] = 'D1';
    const paired = sessionApply(pyramidGame, sessionWithState(pair), 0, 'pyramid.pair', {
      a: { row: 6, col: 0 },
      b: { row: 6, col: 1 },
    });
    expect(paired.rejected).toBeUndefined();
    expect(paired.session.state.pyramid[6]![0]).toBeNull();
    expect(paired.session.state.pyramid[6]![1]).toBeNull();
    expect(paired.fx.map((event) => event.kind)).toContain('pyramid.pair');
  });

  it('pairs a free pyramid card with the waste top', () => {
    const state = emptyState({ waste: ['C3'] });
    state.pyramid[6]![0] = 'S10';
    const outcome = sessionApply(pyramidGame, sessionWithState(state), 0, 'pyramid.pair', {
      a: { row: 6, col: 0 },
      b: 'waste',
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.waste).toEqual([]);
    expect(outcome.session.state.pyramid[6]![0]).toBeNull();
    expect(outcome.fx).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'card.fly',
          payload: expect.objectContaining({
            card: 'S10',
            from: 'pyramid:6:0',
            to: 'waste',
          }),
        }),
      ]),
    );
    expect(outcome.fx.filter((event) => event.kind === 'card.fly')).toHaveLength(1);
  });

  it('refuses a covered card, a non-13 pair, and two waste sources', () => {
    const state = emptyState({ waste: ['H8', 'C5'] });
    state.pyramid[5]![0] = 'S8';
    state.pyramid[6]![0] = 'D4';
    state.pyramid[6]![1] = 'C2';
    state.pyramid[6]![2] = 'H9';
    const session = sessionWithState(state);
    expect(
      sessionApply(pyramidGame, session, 0, 'pyramid.pair', {
        a: { row: 5, col: 0 },
        b: { row: 6, col: 2 },
      }).rejected?.code,
    ).toBe('covered');
    expect(
      sessionApply(pyramidGame, session, 0, 'pyramid.pair', {
        a: { row: 6, col: 0 },
        b: { row: 6, col: 1 },
      }).rejected?.code,
    ).toBe('bad-sum');
    expect(
      sessionApply(pyramidGame, session, 0, 'pyramid.pair', {
        a: 'waste',
        b: 'waste',
      }).rejected?.code,
    ).toBe('waste-waste');
  });

  it('stops recycling after two flips in Classic and allows unlimited in Relaxed', () => {
    const classic = emptyState({ waste: ['S2', 'H3'], recycles: 2 });
    expect(legalMovesFor(classic).some((move) => move.id === 'stock.recycle')).toBe(false);
    expect(
      sessionApply(pyramidGame, sessionWithState(classic), 0, 'stock.recycle').rejected?.code,
    ).toBe('illegal-move');

    const relaxed = emptyState({
      rules: { recyclesLimit: -1 },
      waste: ['S2', 'H3'],
      recycles: 8,
    });
    const outcome = sessionApply(pyramidGame, sessionWithState(relaxed), 0, 'stock.recycle');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.recycles).toBe(9);
    expect(outcome.session.state.stock).toEqual(['H3', 'S2']);
  });

  it('wins at 0 leftover and holes out when stuck', () => {
    const last = emptyState();
    last.pyramid[6]![0] = 'C13';
    const cleared = sessionApply(pyramidGame, sessionWithState(last), 0, 'pyramid.remove', {
      from: { row: 6, col: 0 },
    });
    expect(leftoverOf(cleared.session.state)).toBe(0);
    expect(cleared.session.state.stage).toBe('won');
    expect(cleared.session.result?.reason).toMatch(/cleared/);
    expect(cleared.session.result?.rankings[0]?.detail).toMatchObject({
      leftover: 0,
      cleared: true,
    });
    expect(cleared.fx.map((event) => event.kind)).toContain('pyramid.win');
  });

  it('holes out when stock is empty, no pairs remain, and recycles are gone', () => {
    const state = emptyState({ recycles: 2, stock: ['D7'] });
    state.pyramid[6]![0] = 'S10';
    const outcome = sessionApply(pyramidGame, sessionWithState(state), 0, 'stock.draw');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stage).toBe('holed');
    expect(leftoverOf(outcome.session.state)).toBe(2);
    expect(outcome.fx.map((event) => event.kind)).toContain('pyramid.hole-out');
    expect(legalMovesFor(outcome.session.state)).toEqual([]);
  });
});

describe('public assistance', () => {
  it('does not bounce the last stock card against an unplayable waste', () => {
    const lastStock = emptyState({ stock: ['S2'], waste: ['H4'] });
    lastStock.pyramid[6]![0] = 'S10';
    expect(hintFor(pyramidPlayerView(lastStock))).toEqual({
      move: { id: 'stock.draw' },
      reason: 'Turn the next stock card.',
    });

    const drawn = applyMove(sessionWithState(lastStock), { id: 'stock.draw' });
    expect(drawn.state.stock).toEqual([]);
    expect(hintFor(pyramidPlayerView(drawn.state))).toBeNull();
  });

  it('still recycles when a buried waste card can pair', () => {
    const state = emptyState({ waste: ['H8', 'S2'] });
    state.pyramid[6]![0] = 'S5';
    expect(hintFor(pyramidPlayerView(state))).toEqual({
      move: { id: 'stock.recycle' },
      reason: 'Flip the waste back into the stock.',
    });
  });
});
