import { dailySeed } from '@parlour/game-golf';
import { describe, expect, it } from 'vitest';
import { makeGolfRun, rulesForGolfMode, utcDailyKey } from './modes';

describe('Golf modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makeGolfRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('keeps daily/classic without wrap and Fairway with wrap', () => {
    expect(rulesForGolfMode('daily').wrap).toBe(false);
    expect(rulesForGolfMode('classic').wrap).toBe(false);
    expect(rulesForGolfMode('fairway').wrap).toBe(true);
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makeGolfRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
