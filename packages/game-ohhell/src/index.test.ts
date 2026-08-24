import { describe, expect, it } from 'vitest';
import {
  createOhHellDef,
  ohhellCatalog,
  ohhellConfig,
  ohhellGame,
  orderOhHellHand,
  roundSchedule,
  tierBot,
} from './index';

describe('public exports', () => {
  it('exposes the web-facing contract', () => {
    expect(ohhellGame.id).toBe('ohhell');
    expect(createOhHellDef().id).toBe('ohhell');
    expect(ohhellCatalog.id).toBe('ohhell');
    expect(ohhellCatalog.gameId).toBe('ohhell');
    expect(ohhellCatalog.href).toBe('/ohhell');
    expect(ohhellCatalog.modes.map((mode) => mode.id)).toEqual(['classic', 'quick', 'wizard']);
    expect(ohhellConfig.presets.map((preset) => preset.id)).toEqual(['classic', 'quick', 'wizard']);
    expect(tierBot(3).tier).toBe(3);
    expect(ohhellCatalog.seats).toEqual([3, 4, 5, 6, 7]);
  });

  it('ships a how-to-play doc, three bot tiers, and the full move set', () => {
    expect(ohhellGame.howToPlay.sections.length).toBeGreaterThan(3);
    expect(ohhellGame.bots).toHaveLength(3);
    expect(ohhellGame.moves.bid).toBeDefined();
    expect(ohhellGame.moves.playCard).toBeDefined();
    expect(ohhellGame.moves.chooseTrump).toBeDefined();
    expect(ohhellGame.moves.scoreRound).toBeDefined();
  });

  it('orders a hand for presentation without losing a card', () => {
    const cards = ['S1', 'H5', 'W2', 'J4', 'C7'];
    const ordered = orderOhHellHand(cards, { trumpSuit: 'hearts' });
    expect([...ordered].sort()).toEqual([...cards].sort());
    expect(roundSchedule(ohhellConfig.resolve({}), 4)[0]).toBe(1);
  });
});
