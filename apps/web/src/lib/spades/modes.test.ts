import { describe, expect, it } from 'vitest';
import { spadesCatalog, spadesConfig, type SpadesRules } from '@parlour/game-spades';
import {
  getSpadesMode,
  isSpadesModeId,
  spadesModeForRules,
  SPADES_MODES,
  type SpadesModeId,
} from './modes';

function rulesFor(preset: SpadesModeId): SpadesRules {
  return spadesConfig.resolve(
    spadesConfig.presets.find((entry) => entry.id === preset)!.values as Partial<SpadesRules>,
  );
}

describe('spades modes', () => {
  it('mirrors the pack catalog exactly — ids, order and copy', () => {
    expect(SPADES_MODES.map((mode) => mode.id)).toEqual(spadesCatalog.modes.map((mode) => mode.id));
    for (const mode of SPADES_MODES) {
      const packMode = spadesCatalog.modes.find((entry) => entry.id === mode.id)!;
      expect(mode.name).toBe(packMode.name);
      expect(mode.tagline).toBe(packMode.tagline);
    }
  });

  it('names every mode id as a real config preset', () => {
    const presets = new Set(spadesConfig.presets.map((preset) => preset.id));
    for (const mode of SPADES_MODES) expect(presets.has(mode.id)).toBe(true);
  });

  it('round-trips every preset back to its own mode id', () => {
    for (const mode of SPADES_MODES) {
      expect(spadesModeForRules(rulesFor(mode.id))).toBe(mode.id);
    }
  });

  it('separates the presets on the single field that differs', () => {
    expect(rulesFor('quick').targetScore).toBe(250);
    expect(rulesFor('clean-books').bags).toBe(false);
    expect(rulesFor('classic').bags).toBe(true);
    expect(rulesFor('classic').targetScore).toBe(500);
  });

  it('guards unknown ids', () => {
    expect(isSpadesModeId('classic')).toBe(true);
    expect(isSpadesModeId('blind-nil')).toBe(false);
    expect(() => getSpadesMode('blind-nil' as SpadesModeId)).toThrow(/unknown spades mode/);
  });

  it('keeps blind nil off the shelf — it is deliberately deferred', () => {
    const copy = SPADES_MODES.map((mode) =>
      [mode.name, mode.tagline, mode.description, ...mode.facts].join(' ').toLowerCase(),
    ).join(' ');
    expect(copy).not.toContain('blind');
  });
});
