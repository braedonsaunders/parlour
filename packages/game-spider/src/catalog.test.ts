import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { spiderCatalog } from './catalog';
import { spiderConfig } from './config';

describe('Spider catalog contract', () => {
  it('ships Daily as two-suit Classic plus Relaxed, Classic and Hard', () => {
    expect(spiderConfig.defaults()).toEqual({ suitCount: 2 });
    expect(applyPreset(spiderConfig, 'relaxed')).toEqual({ suitCount: 1 });
    expect(applyPreset(spiderConfig, 'classic')).toEqual({ suitCount: 2 });
    expect(applyPreset(spiderConfig, 'hard')).toEqual({ suitCount: 4 });
    expect(spiderCatalog.seats).toEqual([1]);
    expect(spiderCatalog.href).toBe('/spider');
    expect(spiderCatalog.id).toBe('spider');
    expect(spiderCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['relaxed', 'relaxed'],
      ['classic', 'classic'],
      ['hard', 'hard'],
    ]);
  });
});
