import { describe, expect, it } from 'vitest';
import { createSession, replaySession, stateHash } from '@parlour/engine';
import { pyramidConfig } from './config';
import { dailySeed, isDailyKey } from './daily';
import { leftoverOf, pyramidGame } from './game';

describe('dailySeed', () => {
  it('pins the Classic opening layout and empty-log replay for the v1 daily contract', () => {
    const seed = dailySeed('2026-08-24');
    const session = createSession(pyramidGame, {
      seed,
      config: pyramidConfig.resolve({}),
      seats: 1,
    });
    const hash = stateHash(session.state);
    expect(session.state.pyramid.map((row) => row.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(session.state.waste).toEqual([]);
    expect(session.state.stock).toHaveLength(24);
    expect(leftoverOf(session.state)).toBe(52);
    const replayed = replaySession(pyramidGame, seed, [], {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe(hash);

    const adjacent = createSession(pyramidGame, {
      seed: dailySeed('2026-08-25'),
      config: pyramidConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(adjacent.state)).not.toBe(hash);
  });

  it.each([
    ['2026-08-24', 1_728_459_581],
    ['2024-02-29', -544_100_202],
    ['2000-01-01', 412_336_781],
    ['1970-01-01', 1_909_231_214],
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
