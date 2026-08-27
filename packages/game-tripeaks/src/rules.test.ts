import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { DECK, TABLEAU_SIZE } from './cards';
import { leftoverOf, legalMovesFor } from './game';
import { tripeaksGame } from './game';
import { emptyState, openSession, sessionWithState } from './test-util';

function allStateCards(state: ReturnType<typeof emptyState>): string[] {
  return [
    ...state.stock,
    ...state.hole,
    ...state.tableau.filter((card): card is string => card !== null),
  ];
}

describe('TriPeaks setup and stock', () => {
  it('deals 18 tableau cards, opens one hole card, and leaves 33 in stock', () => {
    const session = openSession(4_201);
    expect(session.state.tableau).toHaveLength(TABLEAU_SIZE);
    expect(session.state.tableau.every((card) => card !== null)).toBe(true);
    expect(session.state.hole).toHaveLength(1);
    expect(session.state.stock).toHaveLength(33);
    expect(new Set(allStateCards(session.state))).toEqual(new Set(DECK.cardIds));
    expect(leftoverOf(session.state)).toBe(TABLEAU_SIZE);
    expect(() =>
      createSession(tripeaksGame, {
        seed: 1,
        config: session.config,
        seats: 2,
      }),
    ).toThrow(/exactly one seat/);
  });

  it('frees only the base row and cards whose two children are both gone', () => {
    const session = openSession(11);
    const legal = legalMovesFor(session.state);
    const playableFroms = new Set(
      legal
        .filter((move) => move.id === 'tableau.play')
        .map((move) => (move.payload as { from: number }).from),
    );
    for (const from of playableFroms) {
      expect(from).toBeGreaterThanOrEqual(9);
    }
  });
});

describe('TriPeaks moves', () => {
  it('plays a free tableau card one rank from the hole and buries it in the hole', () => {
    const state = emptyState({ hole: ['H8'] });
    state.tableau[9] = 'S7';
    const outcome = sessionApply(tripeaksGame, sessionWithState(state), 0, 'tableau.play', {
      from: 9,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.tableau[9]).toBeNull();
    expect(outcome.session.state.hole).toEqual(['H8', 'S7']);
    expect(outcome.fx.map((event) => event.kind)).toContain('tripeaks.play');
  });

  it('refuses a covered card and a card that is not one rank from the hole', () => {
    const state = emptyState({ hole: ['H8'] });
    state.tableau[3] = 'S7';
    state.tableau[9] = 'D4';
    state.tableau[10] = 'C2';
    // A decoy legal play elsewhere keeps 'tableau.play' enumerated so sessionApply
    // routes the specific payloads below into this move's own validate().
    state.tableau[11] = 'S9';
    const session = sessionWithState(state);
    expect(sessionApply(tripeaksGame, session, 0, 'tableau.play', { from: 3 }).rejected?.code).toBe(
      'covered',
    );
    expect(sessionApply(tripeaksGame, session, 0, 'tableau.play', { from: 9 }).rejected?.code).toBe(
      'bad-hole-target',
    );
  });

  it('wraps Ace and King only when the rule is on', () => {
    const noWrap = emptyState({ hole: ['H13'] });
    noWrap.tableau[9] = 'S1';
    // Decoy: keeps 'tableau.play' enumerated even though index 9 itself is illegal.
    noWrap.tableau[10] = 'H12';
    expect(
      sessionApply(tripeaksGame, sessionWithState(noWrap), 0, 'tableau.play', { from: 9 }).rejected
        ?.code,
    ).toBe('bad-hole-target');

    const wrap = emptyState({ rules: { wrap: true, recycle: false }, hole: ['H13'] });
    wrap.tableau[9] = 'S1';
    const outcome = sessionApply(tripeaksGame, sessionWithState(wrap), 0, 'tableau.play', {
      from: 9,
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.hole).toEqual(['H13', 'S1']);
  });

  it('flips the stock onto the hole, burying the previous top', () => {
    const state = emptyState({ hole: ['C5'], stock: ['D9', 'H2'] });
    const outcome = sessionApply(tripeaksGame, sessionWithState(state), 0, 'stock.flip');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stock).toEqual(['D9']);
    expect(outcome.session.state.hole).toEqual(['C5', 'H2']);
    expect(outcome.session.state.moves).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['tripeaks.stock-flip', 'card.flip']),
    );
  });

  it('drops stock.flip from the legal moves once the stock is empty', () => {
    const state = emptyState({ hole: ['C5'], stock: [] });
    state.tableau[9] = 'S6';
    expect(legalMovesFor(state).some((move) => move.id === 'stock.flip')).toBe(false);
    expect(
      sessionApply(tripeaksGame, sessionWithState(state), 0, 'stock.flip').rejected?.code,
    ).toBe('illegal-move');
  });

  it('recycles the hole once in Relaxed and never in Classic', () => {
    const classic = emptyState({ hole: ['C5', 'H2', 'D9'] });
    classic.tableau[9] = 'S6';
    expect(legalMovesFor(classic).some((move) => move.id === 'stock.recycle')).toBe(false);
    expect(
      sessionApply(tripeaksGame, sessionWithState(classic), 0, 'stock.recycle').rejected?.code,
    ).toBe('illegal-move');

    const relaxed = emptyState({
      rules: { wrap: true, recycle: true },
      hole: ['C5', 'H2', 'D9'],
    });
    relaxed.tableau[9] = 'S6';
    const outcome = sessionApply(tripeaksGame, sessionWithState(relaxed), 0, 'stock.recycle');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.hole).toEqual(['D9']);
    expect(new Set(outcome.session.state.stock)).toEqual(new Set(['C5', 'H2']));
    expect(outcome.session.state.recycles).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toContain('tripeaks.stock-recycle');

    const again = sessionApply(
      tripeaksGame,
      sessionWithState(outcome.session.state),
      0,
      'stock.recycle',
    );
    expect(again.rejected?.code).toBe('illegal-move');
  });

  it('wins at 0 leftover and holes out when nothing plays and the stock cannot come back', () => {
    const last = emptyState({ hole: ['H8'] });
    last.tableau[9] = 'S7';
    const cleared = sessionApply(tripeaksGame, sessionWithState(last), 0, 'tableau.play', {
      from: 9,
    });
    expect(leftoverOf(cleared.session.state)).toBe(0);
    expect(cleared.session.state.stage).toBe('won');
    expect(cleared.session.result?.reason).toMatch(/cleared/);
    expect(cleared.session.result?.rankings[0]?.detail).toMatchObject({
      leftover: 0,
      cleared: true,
    });
    expect(cleared.fx.map((event) => event.kind)).toContain('tripeaks.win');

    const stuck = emptyState({ hole: ['H8'], stock: ['D2'] });
    stuck.tableau[9] = 'S13';
    const outcome = sessionApply(tripeaksGame, sessionWithState(stuck), 0, 'stock.flip');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.stage).toBe('holed');
    expect(leftoverOf(outcome.session.state)).toBe(1);
    expect(outcome.fx.map((event) => event.kind)).toContain('tripeaks.hole-out');
    expect(legalMovesFor(outcome.session.state)).toEqual([]);
  });
});
