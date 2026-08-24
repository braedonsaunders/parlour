import { blitzCatalog } from '@parlour/game-blitz';
import { cribbageCatalog } from '@parlour/game-cribbage';
import { heartsCatalog } from '@parlour/game-hearts';
import { ginCatalog } from '@parlour/game-gin';
import { presidentCatalog } from '@parlour/game-president';
import { wildpileCatalog } from '@parlour/game-wildpile';
import { describe, expect, it } from 'vitest';
import { GAMES, getGame, getGameMode, isGameId, isGameModeId, modePreset } from './games';

describe('game shelf catalog', () => {
  it('leads with blitz and keeps the shelf growing', () => {
    expect(GAMES.map((g) => g.id)).toEqual([
      'blitz',
      'cribbage',
      'wild',
      'ratscrew',
      'euchre',
      'hearts',
      'gin',
      'president',
    ]);
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

  it('all shelf games are playable and route to their setup screens', () => {
    expect(getGame('blitz').href).toBe('/play');
    expect(getGame('cribbage').href).toBe('/cribbage');
    expect(getGame('wild').href).toBe('/wild');
    expect(getGame('ratscrew').href).toBe('/ratscrew');
    expect(getGame('euchre').href).toBe('/euchre');
    expect(getGame('hearts').href).toBe('/hearts');
    expect(getGame('gin').href).toBe('/gin');
    expect(getGame('president').href).toBe('/president');
  });

  it('getGame resolves known ids and throws on unknown ones', () => {
    expect(getGame('blitz').id).toBe('blitz');
    expect(() => getGame('nope' as never)).toThrow(/unknown game id/);
  });

  it('isGameId guards arbitrary input', () => {
    expect(isGameId('wild')).toBe(true);
    expect(isGameId('WILD')).toBe(false);
    expect(isGameId(31)).toBe(false);
    expect(isGameId(null)).toBe(false);
  });

  it('takes every entry from the pack that owns it', () => {
    expect(getGame('blitz')).toBe(blitzCatalog);
    expect(getGame('cribbage')).toBe(cribbageCatalog);
    expect(getGame('wild')).toBe(wildpileCatalog);
    expect(getGame('hearts')).toBe(heartsCatalog);
    expect(getGame('gin')).toBe(ginCatalog);
    expect(getGame('president')).toBe(presidentCatalog);
  });

  it('gives every shelved game what the picker screens need', () => {
    for (const game of GAMES) {
      expect(game.gameId.length, game.id).toBeGreaterThan(0);
      expect(game.seats.length, game.id).toBeGreaterThan(0);
      expect(game.howToPlay.sections.length, game.id).toBeGreaterThan(0);
      expect(game.configSchema.fields, game.id).toBeDefined();
      expect(game.handOrder, game.id).toBeTypeOf('function');
      expect(game.art.length, game.id).toBeGreaterThan(0);
      expect(game.modes.length, game.id).toBeGreaterThan(0);

      for (const mode of game.modes) {
        expect(mode.name.length, `${game.id}/${mode.id}`).toBeGreaterThan(0);
        expect(mode.tagline.length, `${game.id}/${mode.id}`).toBeGreaterThan(0);
        expect(mode.description.length, `${game.id}/${mode.id}`).toBeGreaterThan(0);
        expect(mode.facts.length, `${game.id}/${mode.id}`).toBeGreaterThan(0);
        expect(mode.accent, `${game.id}/${mode.id}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(mode.shade, `${game.id}/${mode.id}`).toMatch(/^#[0-9a-f]{6}$/);
        // A tile needs something to draw: a motif or at least one card face.
        expect(Boolean(mode.motif) || (mode.art?.length ?? 0) > 0).toBe(true);
      }
    }
  });

  it("resolves any declared preset against the pack's own config schema", () => {
    for (const game of GAMES) {
      const presets = game.configSchema.presets.map((preset) => preset.id);
      for (const mode of game.modes) {
        const preset = modePreset(mode);
        // A mode without a preset is a match format; it takes the defaults.
        if (preset !== null) expect(presets, `${game.id}/${mode.id}`).toContain(preset);
      }
    }
    expect(modePreset(getGameMode('wild', 'party'))).toBe('party');
    expect(modePreset(getGameMode('blitz', 'timed'))).toBeNull();
  });

  it('looks modes up by game, and refuses ones the pack never declared', () => {
    expect(getGameMode('wild', 'houseRules').name).toBe('House Rules');
    expect(isGameModeId('wild', 'party')).toBe(true);
    expect(isGameModeId('wild', 'timed')).toBe(false);
    expect(() => getGameMode('wild', 'nope')).toThrow(/unknown wild mode id/);
  });
});
