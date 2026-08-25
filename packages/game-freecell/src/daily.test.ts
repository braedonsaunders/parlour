import { describe, expect, it } from 'vitest';
import { dailySeed, isDailyKey } from './daily';
import { createSession, replaySession, stateHash } from '@parlour/engine';
import { freecellConfig } from './config';
import { freecellGame } from './game';

describe('dailySeed', () => {
  it('pins the Classic opening layout and empty-log replay for the v1 daily contract', () => {
    const seed = dailySeed('2026-08-24');
    const session = createSession(freecellGame, {
      seed,
      config: freecellConfig.resolve({}),
      seats: 1,
    });
    const hash = stateHash(session.state);
    expect(session.state.tableau.map((column) => column.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(session.state.cells).toEqual([null, null, null, null]);
    const replayed = replaySession(freecellGame, seed, [], {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe(hash);

    const adjacent = createSession(freecellGame, {
      seed: dailySeed('2026-08-25'),
      config: freecellConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(adjacent.state)).not.toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it.each([
    ['2026-08-24', 1_330_497_339],
    ['2024-02-29', -249_724_276],
    ['2000-01-01', 520_037_479],
    ['1970-01-01', -687_534_624],
  ])('pins %s to its v1 FNV-1a vector', (key, seed) => {
    expect(dailySeed(key)).toBe(seed);
  });

  it('accepts only real zero-padded Gregorian date keys', () => {
    expect(isDailyKey('2024-02-29')).toBe(true);
    for (const invalid of ['2023-02-29', '2026-13-01', '2026-04-31', '26-08-24', '2026-8-24']) {
      expect(isDailyKey(invalid)).toBe(false);
      expect(() => dailySeed(invalid)).toThrow(/real UTC date/);
    }
  });
});
