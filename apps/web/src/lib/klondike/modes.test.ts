import { dailySeed } from '@parlour/game-klondike';
import { describe, expect, it } from 'vitest';
import { makeKlondikeRun, rulesForKlondikeMode, utcDailyKey } from './modes';

describe('Klondike modes', () => {
  it('uses the pack daily seed for a UTC calendar key', () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const run = makeKlondikeRun('daily', { now, randomSeed: 99, id: 'daily-run' });
    expect(utcDailyKey(now)).toBe('2026-08-25');
    expect(run).toEqual({
      id: 'daily-run',
      mode: 'daily',
      seed: dailySeed('2026-08-25'),
      dailyKey: '2026-08-25',
    });
  });

  it('keeps daily/classic Draw Three and Relaxed Draw One', () => {
    expect(rulesForKlondikeMode('daily').drawCount).toBe(3);
    expect(rulesForKlondikeMode('classic').drawCount).toBe(3);
    expect(rulesForKlondikeMode('relaxed').drawCount).toBe(1);
  });

  it('uses the supplied fresh seed without inventing a daily key', () => {
    expect(makeKlondikeRun('classic', { randomSeed: 42, id: 'fresh' })).toEqual({
      id: 'fresh',
      mode: 'classic',
      seed: 42,
      dailyKey: null,
    });
  });
});
