import { beforeEach, describe, expect, it } from 'vitest';
import { dailyResultFor, dailyStreak, usePyramidStatsStore } from './pyramidStats';

beforeEach(() => {
  usePyramidStatsStore.getState().reset();
});

describe('Pyramid local stats', () => {
  it('deduplicates starts and finished holes by run id', () => {
    const stats = usePyramidStatsStore.getState();
    stats.recordStart('run-1');
    stats.recordStart('run-1');
    stats.recordHole({
      runId: 'run-1',
      dailyKey: null,
      leftover: 4,
      moves: 20,
      elapsedMs: 40_000,
      completedAtMs: 1,
    });
    stats.recordHole({
      runId: 'run-1',
      dailyKey: null,
      leftover: 0,
      moves: 30,
      elapsedMs: 50_000,
      completedAtMs: 2,
    });
    expect(usePyramidStatsStore.getState()).toMatchObject({
      dealsStarted: 1,
      holesCompleted: 1,
      clears: 0,
      bestScore: 4,
      bestTimeMs: null,
    });
  });

  it('keeps the lowest leftover as the daily best and counts a clear', () => {
    const stats = usePyramidStatsStore.getState();
    stats.recordHole({
      runId: 'first',
      dailyKey: '2026-08-24',
      leftover: 6,
      moves: 18,
      elapsedMs: 50_000,
      completedAtMs: 1,
    });
    stats.recordHole({
      runId: 'second',
      dailyKey: '2026-08-24',
      leftover: 0,
      moves: 28,
      elapsedMs: 70_000,
      completedAtMs: 2,
    });
    expect(usePyramidStatsStore.getState()).toMatchObject({
      holesCompleted: 2,
      clears: 1,
      bestScore: 0,
      bestTimeMs: 70_000,
    });
    expect(dailyResultFor(usePyramidStatsStore.getState().dailyResults, '2026-08-24')).toEqual({
      key: '2026-08-24',
      bestScore: 0,
      bestMoves: 28,
      bestTimeMs: 70_000,
      cleared: true,
      completedAtMs: 2,
    });
  });

  it('counts a UTC completion streak through yesterday when today is open', () => {
    const results = ['2026-08-21', '2026-08-22', '2026-08-23'].map((key) => ({
      key,
      bestScore: 4,
      bestMoves: 20,
      bestTimeMs: 40_000,
      cleared: false,
      completedAtMs: 1,
    }));
    expect(dailyStreak(results, '2026-08-24')).toBe(3);
    expect(dailyStreak(results, '2026-08-25')).toBe(0);
  });
});
