import { dailySeed } from '@parlour/game-spider';
import { describe, expect, it } from 'vitest';
import { makeSpiderRun, rulesForSpiderMode, utcDailyKey } from './modes';

describe('Spider modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makeSpiderRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('maps daily/classic to two suits, relaxed to one, and hard to four', () => {
    expect(rulesForSpiderMode('daily').suitCount).toBe(2);
    expect(rulesForSpiderMode('classic').suitCount).toBe(2);
    expect(rulesForSpiderMode('relaxed').suitCount).toBe(1);
    expect(rulesForSpiderMode('hard').suitCount).toBe(4);
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makeSpiderRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
