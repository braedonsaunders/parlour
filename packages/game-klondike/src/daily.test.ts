import { describe, expect, it } from 'vitest';
import { dailySeed, isDailyKey } from './daily';
import { createSession, replaySession, stateHash } from '@parlour/engine';
import { klondikeConfig } from './config';
import { klondikeGame } from './game';

describe('dailySeed', () => {
  it('pins the Classic opening layout and empty-log replay for the v1 daily contract', () => {
    const seed = dailySeed('2026-08-24');
    const session = createSession(klondikeGame, {
      seed,
      config: klondikeConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(session.state)).toBe('258d17ce');
    expect(session.state.tableau.map((column) => column.up[0])).toEqual([
      'D5',
      'C12',
      'H9',
      'S13',
      'D11',
      'H13',
      'S3',
    ]);
    expect(session.state.tableau.map((column) => column.down.length)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(session.state.stock).toHaveLength(24);
    const replayed = replaySession(klondikeGame, seed, [], {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe('258d17ce');

    const adjacent = createSession(klondikeGame, {
      seed: dailySeed('2026-08-25'),
      config: klondikeConfig.resolve({}),
      seats: 1,
    });
    expect(stateHash(adjacent.state)).not.toBe('258d17ce');
  });
  it.each([
    ['2026-08-24', 696_954_440],
    ['2024-02-29', 331_039_627],
    ['2000-01-01', -1_282_936_624],
    ['1970-01-01', 1_859_890_391],
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
