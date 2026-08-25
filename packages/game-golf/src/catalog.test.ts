import { describe, expect, it } from 'vitest';
import { applyPreset } from '@parlour/engine';
import { golfCatalog } from './catalog';
import { golfConfig } from './config';

describe('Golf catalog contract', () => {
  it('ships Daily and Classic without wrap and Fairway with Ace–King wrap', () => {
    expect(golfConfig.defaults()).toEqual({ wrap: false });
    expect(applyPreset(golfConfig, 'classic')).toEqual({ wrap: false });
    expect(applyPreset(golfConfig, 'fairway')).toEqual({ wrap: true });
    expect(golfCatalog.seats).toEqual([1]);
    expect(golfCatalog.href).toBe('/golf');
    expect(golfCatalog.modes.map((mode) => [mode.id, mode.preset])).toEqual([
      ['daily', 'classic'],
      ['classic', 'classic'],
      ['fairway', 'fairway'],
    ]);
  });
});
