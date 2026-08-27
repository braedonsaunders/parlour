import { describe, expect, it } from 'vitest';
import * as Pinochle from './index';

describe('public barrel', () => {
  it('exposes the documented web-facing contract', () => {
    expect(Pinochle.GAME_ID).toBe('pinochle');
    expect(typeof Pinochle.createPinochleDef).toBe('function');
    expect(Pinochle.pinochleGame.id).toBe('pinochle');
    expect(Pinochle.pinochleCatalog.seats).toEqual([4]);
    expect(Pinochle.pinochleCatalog.href).toBe('/pinochle');
  });

  it('ships three bot tiers and how-to-play copy', () => {
    expect(Pinochle.pinochleGame.bots).toHaveLength(3);
    expect(Pinochle.pinochleGame.howToPlay.summary.length).toBeGreaterThan(0);
  });

  it('exposes classic/quick/marathon presets', () => {
    const presetIds = Pinochle.pinochleConfig.presets.map((preset) => preset.id).sort();
    expect(presetIds).toEqual(['classic', 'marathon', 'quick']);
  });
});
