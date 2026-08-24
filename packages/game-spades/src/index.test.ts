import { describe, expect, it } from 'vitest';
import {
  createSpadesDef,
  orderSpadesHand,
  spadesCatalog,
  spadesConfig,
  spadesGame,
  teamOf,
  tierBot,
} from './index';

describe('public exports', () => {
  it('exposes the web-facing contract', () => {
    expect(spadesGame.id).toBe('spades');
    expect(createSpadesDef().id).toBe('spades');
    expect(spadesCatalog.id).toBe('spades');
    expect(spadesCatalog.href).toBe('/spades');
    expect(spadesCatalog.modes.map((mode) => mode.id)).toEqual(['classic', 'quick', 'clean-books']);
    expect(spadesConfig.presets.map((preset) => preset.id)).toEqual([
      'classic',
      'quick',
      'clean-books',
    ]);
    expect(tierBot(3).tier).toBe(3);
    expect(teamOf(0)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(teamOf(2)).toBe(0);
    expect(teamOf(3)).toBe(1);
    expect(orderSpadesHand(['S1', 'C2', 'H13'], {})).toEqual(['C2', 'H13', 'S1']);
  });

  it('ships a how-to-play doc and three bot tiers on the game def', () => {
    expect(spadesGame.howToPlay.sections.length).toBeGreaterThan(3);
    expect(spadesGame.bots).toHaveLength(3);
    expect(spadesGame.moves.bid).toBeDefined();
    expect(spadesGame.moves.bidNil).toBeDefined();
    expect(spadesGame.moves.playCard).toBeDefined();
  });
});
