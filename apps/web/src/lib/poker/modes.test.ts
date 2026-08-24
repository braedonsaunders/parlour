import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { pokerCatalog, pokerConfig } from '@parlour/game-poker';
import { POKER_MODES, formatChips, getPokerMode, isPokerModeId, pokerModeForRules } from './modes';

describe('the poker mode catalog', () => {
  it('mirrors the pack presets exactly', () => {
    expect(POKER_MODES.map((mode) => mode.id)).toEqual(
      pokerConfig.presets.map((preset) => preset.id),
    );
    expect(POKER_MODES.map((mode) => mode.id)).toEqual(pokerCatalog.modes.map((mode) => mode.id));
  });

  it('round-trips a preset back to its mode id', () => {
    for (const mode of POKER_MODES) {
      expect(pokerModeForRules(applyPreset(pokerConfig, mode.id))).toBe(mode.id);
    }
  });

  it('names its modes', () => {
    expect(getPokerMode('turbo').name).toBe('Turbo');
    expect(() => getPokerMode('nope' as never)).toThrow(/unknown poker mode/);
    expect(isPokerModeId('deep')).toBe(true);
    expect(isPokerModeId('deeper')).toBe(false);
  });
});

describe('chip counts', () => {
  it('groups the thousands so a stack is readable at a glance', () => {
    expect(formatChips(12450)).toBe('12,450');
    expect(formatChips(0)).toBe('0');
  });
});
