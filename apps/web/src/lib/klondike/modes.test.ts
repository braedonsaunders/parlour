import { dailySeed, isWinnableDeal, klondikeDealFor } from '@parlour/game-klondike';
import { describe, expect, it } from 'vitest';
import { dealKlondikeRun, makeKlondikeRun, rulesForKlondikeMode, utcDailyKey } from './modes';

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
      winnable: null,
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
      winnable: null,
    });
  });

  it('deals the raw shuffle untouched when winnable-only is off', async () => {
    const run = await dealKlondikeRun('classic', { randomSeed: 42, id: 'fresh' });

    expect(run).toEqual(makeKlondikeRun('classic', { randomSeed: 42, id: 'fresh' }));
  });

  it('swaps in a proven seed for the mode’s own draw rule when asked', async () => {
    const run = await dealKlondikeRun('relaxed', {
      randomSeed: 42,
      id: 'fresh',
      winnableOnly: true,
    });

    expect(run.winnable).toBe(true);
    expect(run.id).toBe('fresh');
    expect(isWinnableDeal(klondikeDealFor(run.seed, 1), { drawCount: 1 })).toBe(true);
  }, 60_000);

  it('gives every player the same daily table for a date', async () => {
    const now = new Date('2026-08-24T23:59:59.000-04:00');
    const first = await dealKlondikeRun('daily', { now, id: 'a', winnableOnly: true });
    const second = await dealKlondikeRun('daily', { now, id: 'b', winnableOnly: true });

    expect(second.seed).toBe(first.seed);
    expect(first.winnable).toBe(true);
  }, 60_000);
});
