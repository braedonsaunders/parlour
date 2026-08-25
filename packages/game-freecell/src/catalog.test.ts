import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { freecellCatalog } from './catalog';
import { freecellConfig } from './config';

describe('FreeCell catalog contract', () => {
  it('ships Daily and Classic as four cells and Relaxed as six', () => {
    expect(freecellConfig.defaults()).toEqual({ freeCells: 4 });
    expect(applyPreset(freecellConfig, 'classic')).toEqual({ freeCells: 4 });
    expect(applyPreset(freecellConfig, 'relaxed')).toEqual({ freeCells: 6 });
    expect(freecellCatalog.seats).toEqual([1]);
    expect(freecellCatalog.href).toBe('/freecell');
    expect(freecellCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['classic', 'classic'],
      ['relaxed', 'relaxed'],
    ]);
  });
});
