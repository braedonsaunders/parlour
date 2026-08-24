import { describe, expect, it } from 'vitest';
import { dailySeed, isDailyKey } from './daily';

describe('dailySeed', () => {
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
