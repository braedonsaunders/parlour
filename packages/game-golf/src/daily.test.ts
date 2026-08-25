import { describe, expect, it } from 'vitest';
import { createSession, replaySession, stateHash } from '@parlour/engine';
import { golfConfig } from './config';
import { dailySeed, isDailyKey } from './daily';
import { golfGame } from './game';

describe('dailySeed', () => {
  it('pins the Classic opening layout and empty-log replay for the v1 daily contract', () => {
    const seed = dailySeed('2026-08-24');
    const session = createSession(golfGame, {
      seed,
      config: golfConfig.resolve({}),
      seats: 1,
    });
    const hash = stateHash(session.state);
    expect(session.state.tableau.map((column) => column.length)).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(session.state.waste).toHaveLength(1);
    expect(session.state.stock).toHaveLength(16);
    const replayed = replaySession(golfGame, seed, [], {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe(hash);

    const adjacent = createSession(golfGame, {
      seed: dailySeed('2026-08-25'),
      config: golfConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(adjacent.state)).not.toBe(hash);
    expect(session.state.tableau.map((column) => column.at(-1))).toBeDefined();
  });

  it.each([
    ['2026-08-24', 1_014_023_481],
    ['2024-02-29', 1_925_958_714],
    ['2000-01-01', 473_139_945],
    ['1970-01-01', -576_832_030],
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
