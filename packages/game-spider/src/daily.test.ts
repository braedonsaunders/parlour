import { describe, expect, it } from 'vitest';
import { dailySeed, isDailyKey } from './daily';
import { createSession, replaySession, stateHash } from '@parlour/engine';
import { spiderConfig } from './config';
import { spiderGame } from './game';

describe('dailySeed', () => {
  it('pins the Classic opening layout and empty-log replay for the v1 daily contract', () => {
    const seed = dailySeed('2026-08-24');
    const session = createSession(spiderGame, {
      seed,
      config: spiderConfig.resolve({}),
      seats: 1,
    });
    expect(session.state.tableau.map((column) => column.up.length)).toEqual(Array(10).fill(1));
    expect(session.state.tableau.map((column) => column.down.length)).toEqual([
      5, 5, 5, 5, 4, 4, 4, 4, 4, 4,
    ]);
    expect(session.state.stock).toHaveLength(50);
    const replayed = replaySession(spiderGame, seed, [], {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));

    const adjacent = createSession(spiderGame, {
      seed: dailySeed('2026-08-25'),
      config: spiderConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(adjacent.state)).not.toBe(stateHash(session.state));
  });

  it.each([
    ['2026-08-24', 438_951_640],
    ['2024-02-29', 73_036_827],
    ['2000-01-01', 1_574_171_680],
    ['1970-01-01', -1_513_223_513],
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
