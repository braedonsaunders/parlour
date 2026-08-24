import { describe, expect, it } from 'vitest';
import { GAMES, getGame, isGameId } from './games';

describe('game shelf catalog', () => {
  it('leads with blitz, then wild, then euchre', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['blitz', 'wild', 'euchre']);
  });

  it('every game carries complete presentation data', () => {
    for (const game of GAMES) {
      expect(game.name.length).toBeGreaterThan(0);
      expect(game.subtitle.length).toBeGreaterThan(0);
      expect(game.tagline.length).toBeGreaterThan(0);
      expect(game.description.length).toBeGreaterThan(0);
      expect(game.facts.length).toBeGreaterThan(0);
      expect(game.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(game.shade).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('both games are playable and route to their setup screens (M5 exit)', () => {
    expect(getGame('blitz').href).toBe('/play');
    expect(getGame('wild').href).toBe('/wild');
    expect(getGame('euchre').href).toBe('/euchre');
  });

  it('getGame resolves known ids and throws on unknown ones', () => {
    expect(getGame('blitz').id).toBe('blitz');
    expect(() => getGame('cribbage' as never)).toThrow(/unknown game id/);
  });

  it('isGameId guards arbitrary input', () => {
    expect(isGameId('wild')).toBe(true);
    expect(isGameId('WILD')).toBe(false);
    expect(isGameId(31)).toBe(false);
    expect(isGameId(null)).toBe(false);
  });
});
