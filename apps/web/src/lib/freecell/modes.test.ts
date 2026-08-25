import { dailySeed } from '@parlour/game-freecell';
import { describe, expect, it } from 'vitest';
import { makeFreecellRun, rulesForFreecellMode, utcDailyKey } from './modes';

describe('FreeCell modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makeFreecellRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('keeps daily/classic on four cells and Relaxed on six', () => {
    expect(rulesForFreecellMode('daily').freeCells).toBe(4);
    expect(rulesForFreecellMode('classic').freeCells).toBe(4);
    expect(rulesForFreecellMode('relaxed').freeCells).toBe(6);
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makeFreecellRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
