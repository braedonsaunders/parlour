import { describe, expect, it } from 'vitest';
import { FOUNDATION_SLOTS, TABLEAU_COLUMNS } from './cards';
import { legalMovesFor } from './game';
import { findWinnableSeed } from './winnable';
import { isWinnableDeal, solveSpider, spiderDealFor } from './solver';
import { applyMove, openSession } from './test-util';
import type { SpiderState } from './state';
import { sessionWithState } from './test-util';

describe('Spider solver', () => {
  it('proves the known 2-suit openings the budget finds', () => {
    // Seeds 4/25 prove deterministically inside the default budget, so this
    // call guards the search instead of sampling randomly.
    for (const seed of [4, 25] as const) {
      const solved = solveSpider(spiderDealFor(seed, 2));
      expect(solved.outcome).toBe('solved');
      expect(solved.line.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('hands back a line the real game accepts move for move', () => {
    // The whole guarantee: replay the answer through the engine and let the
    // rules judge it. Any card the solver invented and the engine rejects it.
    for (const [seed, suits] of [
      [4, 2],
      [25, 2],
      [8, 1],
    ] as const) {
      const solved = solveSpider(spiderDealFor(seed, suits));
      expect(solved.outcome).toBe('solved');
      expect(solved.line.length).toBeGreaterThan(0);

      let session = openSession(seed, { suitCount: suits });
      for (const move of solved.line) session = applyMove(session, move);

      expect(session.state.stage).toBe('won');
      expect(session.status).toBe('ended');
      expect(session.state.foundations.filter((pile) => pile.length > 0)).toHaveLength(
        FOUNDATION_SLOTS,
      );
    }
  }, 240_000);

  it('does not claim a deal it cannot prove', () => {
    // Honesty contract: at 4 suits the default budget proves nothing usable,
    // so the deal finder must answer `winnable: false` instead of guessing.
    // Small maxCandidates keeps the PR lane quick without weakening the claim.
    const found = findWinnableSeed(1, 4, { nodeBudget: 20_000, maxCandidates: 2 });
    expect(found.winnable).toBe(false);
    expect(found.line).toEqual([]);
  });

  it('respects the engine gate against deals on an empty column', () => {
    // A stock deal over an empty column is illegal; the solver's canDeal check
    // and the engine's gate must agree, or proven lines would replay wrongly.
    const base = openSession(1, { suitCount: 2 }).state;
    const state: SpiderState = {
      ...base,
      stage: 'playing',
      stock: base.stock.slice(0, TABLEAU_COLUMNS),
      tableau: base.tableau.map((column, index) =>
        index === 0 ? { down: [], up: [] } : column,
      ),
      foundations: [],
      moves: 0,
    };
    const session = sessionWithState(state);
    expect(legalMovesFor(state).some((move) => move.id === 'stock.deal')).toBe(false);
    expect(session.status).toBe('playing');
  });
});

describe('Spider winnable seed search', () => {
  it('returns a 2-suit seed the solver has actually proven', () => {
    const found = findWinnableSeed(4, 2);

    expect(found.winnable).toBe(true);
    expect(found.line.length).toBeGreaterThan(0);
    expect(isWinnableDeal(spiderDealFor(found.seed, 2), {})).toBe(true);
  }, 240_000);

  it('gives every player the same table for the same seed and rule', () => {
    expect(findWinnableSeed(9, 2)).toEqual(findWinnableSeed(9, 2));
  }, 240_000);
});
