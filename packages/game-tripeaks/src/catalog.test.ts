import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { tripeaksCatalog } from './catalog';
import { tripeaksConfig } from './config';

describe('TriPeaks catalog contract', () => {
  it('ships Daily and Classic with no wrap/recycle, and Relaxed with both on', () => {
    expect(tripeaksConfig.defaults()).toEqual({ wrap: false, recycle: false });
    expect(applyPreset(tripeaksConfig, 'classic')).toEqual({ wrap: false, recycle: false });
    expect(applyPreset(tripeaksConfig, 'relaxed')).toEqual({ wrap: true, recycle: true });
    expect(tripeaksCatalog.seats).toEqual([1]);
    expect(tripeaksCatalog.href).toBe('/tripeaks');
    expect(tripeaksCatalog.facts).toEqual(['1 player', 'daily seeded peaks', 'offline']);
    expect(tripeaksCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['classic', 'classic'],
      ['relaxed', 'relaxed'],
    ]);
  });
});
