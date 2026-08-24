import { beforeEach, describe, expect, it } from 'vitest';
import { dailyResultFor, dailyStreak, useKlondikeStatsStore } from './klondikeStats';

beforeEach(() => {
  useKlondikeStatsStore.getState().reset();
});

describe('Klondike local stats', () => {
  it('deduplicates starts and wins by run id', () => {
    const stats = useKlondikeStatsStore.getState();
    stats.recordStart('run-1');
    stats.recordStart('run-1');
    stats.recordWin({
      runId: 'run-1',
      dailyKey: null,
      moves: 120,
      elapsedMs: 90_000,
      completedAtMs: 1,
    });
    stats.recordWin({
      runId: 'run-1',
      dailyKey: null,
      moves: 80,
      elapsedMs: 60_000,
      completedAtMs: 2,
    });
    expect(useKlondikeStatsStore.getState()).toMatchObject({
      dealsStarted: 1,
      wins: 1,
      bestMoves: 120,
      bestTimeMs: 90_000,
    });
  });

  it('keeps independent best moves/time for a replayed daily table', () => {
    const stats = useKlondikeStatsStore.getState();
    stats.recordWin({
      runId: 'first',
      dailyKey: '2026-08-24',
      moves: 120,
      elapsedMs: 70_000,
      completedAtMs: 1,
    });
    stats.recordWin({
      runId: 'second',
      dailyKey: '2026-08-24',
      moves: 110,
      elapsedMs: 80_000,
      completedAtMs: 2,
    });
    expect(dailyResultFor(useKlondikeStatsStore.getState().dailyResults, '2026-08-24')).toEqual({
      key: '2026-08-24',
      bestMoves: 110,
      bestTimeMs: 70_000,
      completedAtMs: 2,
    });
  });

  it('counts a UTC completion streak through yesterday when today is open', () => {
    const results = ['2026-08-21', '2026-08-22', '2026-08-23'].map((key) => ({
      key,
      bestMoves: 100,
      bestTimeMs: 60_000,
      completedAtMs: 1,
    }));
    expect(dailyStreak(results, '2026-08-24')).toBe(3);
    expect(dailyStreak(results, '2026-08-25')).toBe(0);
  });
});
