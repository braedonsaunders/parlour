import { dailySeed } from '@parlour/game-pyramid';
import { describe, expect, it } from 'vitest';
import { makePyramidRun, rulesForPyramidMode, utcDailyKey } from './modes';

describe('Pyramid modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makePyramidRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('keeps daily/classic on two recycles and Relaxed unlimited', () => {
    expect(rulesForPyramidMode('daily').recyclesLimit).toBe(2);
    expect(rulesForPyramidMode('classic').recyclesLimit).toBe(2);
    expect(rulesForPyramidMode('relaxed').recyclesLimit).toBe(-1);
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makePyramidRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
