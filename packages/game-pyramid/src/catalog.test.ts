import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { pyramidCatalog } from './catalog';
import { pyramidConfig } from './config';

describe('Pyramid catalog contract', () => {
  it('ships Daily and Classic with two recycles and Relaxed unlimited', () => {
    expect(pyramidConfig.defaults()).toEqual({ recyclesLimit: 2 });
    expect(applyPreset(pyramidConfig, 'classic')).toEqual({ recyclesLimit: 2 });
    expect(applyPreset(pyramidConfig, 'relaxed')).toEqual({ recyclesLimit: -1 });
    expect(pyramidCatalog.seats).toEqual([1]);
    expect(pyramidCatalog.href).toBe('/pyramid');
    expect(pyramidCatalog.facts).toEqual(['1 player', 'daily seeded pyramid', 'offline']);
    expect(pyramidCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['classic', 'classic'],
      ['relaxed', 'relaxed'],
    ]);
  });
});
