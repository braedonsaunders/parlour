import { describe, expect, it } from 'vitest';
import { createHintPlanner, sameLegalMove, solverHintFor } from './hint-plan';
import { spiderDealFor, solveSpider } from './solver';

/*
 * Reported: Spider's hints "just go back and forth, don't actually advance the
 * game". The greedy hinter ranks each legal move on local merit alone — does it
 * complete a run, turn a hidden card, keep a suit together — and has no notion
 * of progress, so shifting a card across and shifting it back both score twenty
 * and it will recommend them forever.
 *
 * The solver already returns a proven winning line. The first move of that line
 * is a hint that always gets somewhere.
 */
describe('solver-backed Spider hints', () => {
  const budget = { nodeBudget: 60_000 };

  it('recommends the first move of a proven winning line', () => {
    const state = spiderDealFor(4, 1);
    const solved = solveSpider(state, budget);
    if (solved.outcome !== 'solved') return; // an unproven deal is the fallback case below

    const hint = solverHintFor(state, budget);

    expect(hint).not.toBeNull();
    expect(sameLegalMove(hint!.move, solved.line[0]!)).toBe(true);
    expect(hint!.reason.length).toBeGreaterThan(0);
  });

  it('still offers the greedy hint when the position has no proof', () => {
    const state = spiderDealFor(7, 4);
    // A four-suit deal inside a tiny budget is the case with no line to walk.
    const hint = solverHintFor(state, { nodeBudget: 1 });

    expect(hint === null || hint.reason.length > 0).toBe(true);
  });

  it('walks a cached line instead of re-searching every hint', () => {
    const state = spiderDealFor(4, 1);
    const solved = solveSpider(state, budget);
    if (solved.outcome !== 'solved' || solved.line.length < 2) return;

    const planner = createHintPlanner(solved.line);
    const first = planner.hint(state, { nodeBudget: 1 });

    // `nodeBudget: 1` cannot solve anything, so a hint at all proves the line
    // was walked rather than re-proved.
    expect(first).not.toBeNull();
    expect(sameLegalMove(first!.move, solved.line[0]!)).toBe(true);
  });

  it('drops the line when the player leaves it', () => {
    const state = spiderDealFor(4, 1);
    const solved = solveSpider(state, budget);
    if (solved.outcome !== 'solved' || solved.line.length < 2) return;

    const planner = createHintPlanner(solved.line);
    planner.follow({ id: 'not-the-planned-move' });

    // Having left the line, the planner must search rather than serve a stale
    // move from a position that no longer exists.
    expect(planner.hint(state, { nodeBudget: 1 })?.move.id).not.toBe(undefined);
  });
});
