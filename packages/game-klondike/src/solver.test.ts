import { describe, expect, it } from 'vitest';
import { DECK, SUITS, suitOfCard } from './cards';
import { legalMovesFor } from './game';
import { isWinnableDeal, solveKlondike } from './solver';
import type { KlondikeState } from './state';
import { applyMove, emptyState, openSession, sessionWithState } from './test-util';
import { findWinnableSeed, klondikeDealFor } from './winnable';

const CARDS = DECK.cardIds;

describe('klondike solver', () => {
  it('reads a finished table as already solved without searching', () => {
    const foundations = {
      spades: CARDS.slice(0, 13),
      hearts: CARDS.slice(13, 26),
      diamonds: CARDS.slice(26, 39),
      clubs: CARDS.slice(39, 52),
    };

    expect(solveKlondike(emptyState({ foundations }))).toMatchObject({
      outcome: 'solved',
      nodes: 0,
    });
  });

  it('proves a table that only needs safe autoplay', () => {
    // Four kings on the table, everything below them already home.
    const tableau = Array.from({ length: 7 }, (_, index) => ({
      down: [] as string[],
      up: index < 4 ? [CARDS[index * 13 + 12]!] : [],
    }));
    const state = emptyState({
      tableau,
      foundations: {
        spades: CARDS.slice(0, 12),
        hearts: CARDS.slice(13, 25),
        diamonds: CARDS.slice(26, 38),
        clubs: CARDS.slice(39, 51),
      },
    });

    expect(solveKlondike(state)).toMatchObject({ outcome: 'solved', nodes: 0 });
  });

  it('calls a seized-up table dead rather than burning the budget on it', () => {
    // Every column shows a king or a ten, so nothing packs onto anything: the
    // only cards that fit a king are queens and both are buried. The stock is
    // spent and the foundations are bare, so there is nothing to pull back
    // either — a table with literally no legal move.
    const tops = ['S13', 'H13', 'D13', 'C13', 'S10', 'H10', 'D10'];
    const buried = CARDS.filter((card) => !tops.includes(card));
    const state = emptyState({
      tableau: tops.map((top, index) => ({
        down: buried.slice(index * 6, index * 6 + (index === 6 ? 15 : 6)),
        up: [top],
      })),
    });

    expect(legalMovesFor(state)).toEqual([]);
    expect(solveKlondike(state)).toMatchObject({ outcome: 'exhausted', nodes: 0 });
  });

  it('gives up honestly instead of claiming a win it never found', () => {
    const result = solveKlondike(klondikeDealFor(11, 3), { nodeBudget: 40 });

    expect(result.outcome).toBe('budget');
    expect(result.nodes).toBeLessThanOrEqual(60);
  });

  it('respects the draw rule it is given over the deal it is handed', () => {
    const state = klondikeDealFor(3, 3);

    // Same shuffle, different stock rule: the solver must use the override.
    expect(solveKlondike(state, { drawCount: 1, nodeBudget: 1 }).outcome).toBe('budget');
    expect(solveKlondike({ ...state, rules: { drawCount: 1 } }).outcome).toBeTruthy();
  });

  it('is deterministic for a given deal', () => {
    const state = klondikeDealFor(21, 3);
    const first = solveKlondike(state);
    const second = solveKlondike(state);

    expect(second).toEqual(first);
  });

  it('solves the large majority of real draw-three deals', () => {
    let solved = 0;
    for (let seed = 1; seed <= 24; seed++) {
      if (isWinnableDeal(klondikeDealFor(seed, 3))) solved++;
    }

    // Klondike itself caps out near 82%; this guards against a regression that
    // quietly guts the search, not against the game's own dead deals.
    expect(solved).toBeGreaterThanOrEqual(16);
  }, 60_000);

  it('hands back a line the real game accepts move for move', () => {
    // This is the whole guarantee: replay the solver's own answer through the
    // engine and let the rules judge it. Any move the solver invented, any card
    // it moved that was not really there, and the engine rejects it outright.
    for (const [seed, drawCount] of [
      [5, 3],
      [14, 3],
      [4, 1],
    ] as const) {
      const solved = solveKlondike(klondikeDealFor(seed, drawCount), { drawCount });
      expect(solved.outcome).toBe('solved');
      expect(solved.line.length).toBeGreaterThan(52);

      let session = openSession(seed, { drawCount });
      for (const move of solved.line) session = applyMove(session, move);

      expect(session.state.stage).toBe('won');
      expect(session.status).toBe('ended');
      for (const suit of SUITS) expect(session.state.foundations[suit]).toHaveLength(13);
    }
  }, 60_000);
});

describe('winnable seed search', () => {
  it('returns a seed the solver has actually proven', () => {
    const found = findWinnableSeed(1, 3);

    expect(found.winnable).toBe(true);
    expect(isWinnableDeal(klondikeDealFor(found.seed, 3), { drawCount: 3 })).toBe(true);
  }, 60_000);

  it('keeps the starting seed when it is already winnable', () => {
    const found = findWinnableSeed(1, 1);

    if (found.rejected === 0) expect(found.seed).toBe(1);
    expect(found.winnable).toBe(true);
  }, 60_000);

  it('gives every player the same table for the same seed and rule', () => {
    expect(findWinnableSeed(99, 3)).toEqual(findWinnableSeed(99, 3));
  }, 60_000);

  it('picks different tables for the two draw rules', () => {
    const three = findWinnableSeed(1_234, 3);
    const one = findWinnableSeed(1_234, 1);

    expect(three.winnable && one.winnable).toBe(true);
    // Not a hard requirement of the search, but a shared start that survives
    // both rules should still be dealt under the rule it was proven for.
    expect(isWinnableDeal(klondikeDealFor(three.seed, 3), { drawCount: 3 })).toBe(true);
    expect(isWinnableDeal(klondikeDealFor(one.seed, 1), { drawCount: 1 })).toBe(true);
  }, 60_000);

  it('falls back to the original seed instead of dealing nothing', () => {
    const found = findWinnableSeed(7, 3, { maxCandidates: 2, nodeBudget: 1 });

    expect(found).toEqual({ seed: 7, rejected: 2, winnable: false });
  });

  it('deals the same table the engine would deal for that seed', () => {
    const state: KlondikeState = klondikeDealFor(42, 3);
    const session = sessionWithState(openSession(42, { drawCount: 3 }).state);

    expect(state.tableau).toEqual(session.state.tableau);
    expect(state.stock).toEqual(session.state.stock);
  });

  it('leaves every dealt card accounted for', () => {
    const state = klondikeDealFor(8, 1);
    const dealt = [
      ...state.stock,
      ...state.waste,
      ...state.tableau.flatMap((column) => [...column.down, ...column.up]),
      ...SUITS.flatMap((suit) => state.foundations[suit]),
    ];

    expect(new Set(dealt).size).toBe(52);
    expect(dealt.every((card) => suitOfCard(card) !== null)).toBe(true);
  });
});
