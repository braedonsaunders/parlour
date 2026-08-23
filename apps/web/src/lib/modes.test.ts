import { describe, expect, it } from 'vitest';
import { MODES, getMode, isModeId } from './modes';

describe('mode catalog', () => {
  it('ships exactly classic, fast and timed in spec order', () => {
    expect(MODES.map((m) => m.id)).toEqual(['classic', 'fast', 'timed']);
  });

  it('every mode carries complete presentation data', () => {
    for (const mode of MODES) {
      expect(mode.name.length).toBeGreaterThan(0);
      expect(mode.tagline.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.facts.length).toBeGreaterThan(0);
      expect(mode.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(mode.shade).toMatch(/^#[0-9a-f]{6}$/);
      expect(['lives', 'snap', 'clock']).toContain(mode.preview);
    }
  });

  it('timed is the only format with a forced turn timer fact (spec §5.3)', () => {
    expect(MODES.find((m) => m.id === 'timed')?.facts.join(' ')).toMatch(/turn timer/i);
  });

  it('getMode resolves known ids and throws on unknown ones', () => {
    expect(getMode('classic').id).toBe('classic');
    expect(() => getMode('blitz-race' as never)).toThrow(/unknown mode id/);
  });

  it('isModeId guards arbitrary input', () => {
    expect(isModeId('fast')).toBe(true);
    expect(isModeId('FAST')).toBe(false);
    expect(isModeId(7)).toBe(false);
    expect(isModeId(null)).toBe(false);
  });
});
