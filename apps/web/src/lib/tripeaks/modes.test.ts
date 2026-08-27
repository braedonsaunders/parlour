import { dailySeed } from '@parlour/game-tripeaks';
import { describe, expect, it } from 'vitest';
import { makeTripeaksRun, rulesForTripeaksMode, utcDailyKey } from './modes';

describe('TriPeaks modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makeTripeaksRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('keeps daily/classic with no wrap or recycle, and Relaxed with both on', () => {
    expect(rulesForTripeaksMode('daily')).toEqual({ wrap: false, recycle: false });
    expect(rulesForTripeaksMode('classic')).toEqual({ wrap: false, recycle: false });
    expect(rulesForTripeaksMode('relaxed')).toEqual({ wrap: true, recycle: true });
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makeTripeaksRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
