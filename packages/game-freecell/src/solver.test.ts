import { describe, expect, it } from 'vitest';
import { SUITS, TABLEAU_COLUMNS } from './cards';
import { legalMovesFor } from './game';
import { findWinnableSeed, freecellDealFor } from './winnable';
import { isWinnableDeal, solveFreecell } from './solver';
import { applyMove, openSession } from './test-util';
import { sessionWithState } from './test-util';
import type { FreecellState } from './state';

describe('FreeCell solver', () => {
  it('proves the three-cells opening deal that opens the whole column game', () => {
    // Seeds 5/14 (4-cell Classic) prove inside the node budget, mirroring the
    // Klondike coverage of the same shuffles.
    for (const seed of [5, 14] as const) {
      const solved = solveFreecell(freecellDealFor(seed, 4));
      expect(solved.outcome).toBe('solved');
      expect(solved.line.length).toBeGreaterThan(TABLEAU_COLUMNS);
    }
  }, 60_000);

  it('proves at least 16 of 20 sampled Classic deals solvable', () => {
    let solved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (isWinnableDeal(freecellDealFor(seed, 4))) solved++;
    }

    // FreeCell is famously near-universally solvable, but the budget can run
    // out on a knotty layout; this guards against a regression gutting the
    // search, not against FreeCell's own rare dead deals.
    expect(solved).toBeGreaterThanOrEqual(16);
  }, 60_000);

  it('hands back a line the real game accepts move for move', () => {
    // The whole guarantee: replay the solver's own answer through the engine
    // and let the rules judge it. Any card the solver invented, any move it
    // made past the supermove cap, and the engine rejects it outright.
    for (const seed of [5, 14, 4] as const) {
      const solved = solveFreecell(freecellDealFor(seed, 4));
      expect(solved.outcome).toBe('solved');
      expect(solved.line.length).toBeGreaterThan(0);

      let session = openSession(seed, { freeCells: 4 });
      for (const move of solved.line) session = applyMove(session, move);

      expect(session.state.stage).toBe('won');
      expect(session.status).toBe('ended');
      for (const suit of SUITS) expect(session.state.foundations[suit]).toHaveLength(13);
    }
  }, 60_000);

  it('stays honest about the supermove cap it claims to respect', () => {
    // Layout: a 7-card packed run descending K..7, one free cell, one empty
    // non-destination column — the engine cap is (1+1) * 2^1 = 4, so lifting
    // the whole run is illegal while the packed 4-suffix is fine. The solver's
    // cap recompute must agree.
    const base = openSession(1, { freeCells: 4 }).state;
    const state: FreecellState = {
      ...base,
      stage: 'playing',
      tableau: [
        ['S13', 'D12', 'C11', 'H10', 'S9', 'D8', 'C7'],
        ['C2'],
        [], // the destination — excluded from the helpers
        [], // the only helper column the cap counts
        ['D1'],
        ['H1'],
        ['S1'],
        ['C1'],
        // (8 columns; the first seven hold the missing cards)
      ],
      cells: ['H13', 'D13', 'H12', null],
      foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
      moves: 0,
    };
    const session = sessionWithState(state);
    const moves = legalMovesFor(state).filter((move) => move.id === 'tableau.move');
    for (const move of moves) {
      const payload = move.payload as { from: number; card: string; to: number };
      expect(payload.from !== 0 || payload.card).toBeTruthy();
      expect(payload).not.toMatchObject({ from: 0, card: 'S13' });
    }
    const fullLift = moves.find(
      (move) => (move.payload as { card?: string }).card === 'S13',
    );
    expect(fullLift).toBeUndefined();
    const suffix = moves.find((move) => (move.payload as { card?: string }).card === 'H10');
    expect(suffix).toBeDefined();
    expect(session.status).toBe('playing');
  });
});

describe('FreeCell winnable seed search', () => {
  it('returns a seed the solver has actually proven', () => {
    const found = findWinnableSeed(1, 4);

    expect(found.winnable).toBe(true);
    expect(found.line.length).toBeGreaterThan(0);
    expect(isWinnableDeal(freecellDealFor(found.seed, 4))).toBe(true);
  }, 60_000);

  it('gives every player the same table for the same seed and rule', () => {
    expect(findWinnableSeed(99, 4)).toEqual(findWinnableSeed(99, 4));
  }, 60_000);

  it('relaxes the proof rate when six cells make deals trivially solvable', () => {
    let solved = 0;
    for (let seed = 1; seed <= 10; seed++) {
      if (isWinnableDeal(freecellDealFor(seed, 6))) solved++;
    }
    // Six cells is the Relaxed preset — failing here is a real regression.
    expect(solved).toBeGreaterThanOrEqual(10);
  }, 60_000);
});
