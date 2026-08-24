import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { klondikeCatalog } from './catalog';
import { klondikeConfig } from './config';

describe('Klondike catalog contract', () => {
  it('ships Daily and Classic as Draw Three and Relaxed as Draw One', () => {
    expect(klondikeConfig.defaults()).toEqual({ drawCount: 3 });
    expect(applyPreset(klondikeConfig, 'classic')).toEqual({ drawCount: 3 });
    expect(applyPreset(klondikeConfig, 'relaxed')).toEqual({ drawCount: 1 });
    expect(klondikeCatalog.seats).toEqual([1]);
    expect(klondikeCatalog.href).toBe('/klondike');
    expect(klondikeCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['classic', 'classic'],
      ['relaxed', 'relaxed'],
    ]);
  });
});
