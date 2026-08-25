import { blitzCatalog } from '@parlour/game-blitz';
import { cribbageCatalog } from '@parlour/game-cribbage';
import { euchreCatalog } from '@parlour/game-euchre';
import { heartsCatalog } from '@parlour/game-hearts';
import { ginCatalog } from '@parlour/game-gin';
import { freecellCatalog } from '@parlour/game-freecell';
import { golfCatalog } from '@parlour/game-golf';
import { klondikeCatalog } from '@parlour/game-klondike';
import { pyramidCatalog } from '@parlour/game-pyramid';
import { spiderCatalog } from '@parlour/game-spider';
import { presidentCatalog } from '@parlour/game-president';
import { ratscrewCatalog } from '@parlour/game-ratscrew';
import { wildpileCatalog } from '@parlour/game-wildpile';
import { describe, expect, it } from 'vitest';
import { isMultiplayerGameId } from '@/lib/rooms/gameIds';
import { GAMES, getGame, getGameMode, isGameId, isGameModeId, modePreset } from './shelf';

describe('game shelf catalog', () => {
  it('leads with blitz and keeps the shelf growing', () => {
    expect(GAMES.map((g) => g.id)).toEqual([
      'blitz',
      'cribbage',
      'wild',
      'eights',
      'ratscrew',
      'euchre',
      'spades',
      'poker',
      'ohhell',
      'scopa',
      'spite',
      'klondike',
      'golf',
      'freecell',
      'spider',
      'pyramid',
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
    /*
     * Games whose pack is finished but whose table is not yet built. `href:
     * null` is the catalog's own "coming soon" state and the shelf renders it
     * as a disabled tile with a ribbon.
     *
     * Named explicitly so the two cases stay distinguishable: a game that means
     * to be shelved is listed here, and a game that lost its route by accident
     * still fails.
     */
    const SHELVED = new Set<string>();
    for (const game of GAMES) {
      if (SHELVED.has(game.id)) {
        expect(game.href, `${game.id} is shelved`).toBeNull();
        continue;
      }
      expect(game.href, game.id).toMatch(/^\//);
    }
    expect(getGame('blitz').href).toBe('/play');
    expect(getGame('cribbage').href).toBe('/cribbage');
    expect(getGame('wild').href).toBe('/wild');
    expect(getGame('ratscrew').href).toBe('/ratscrew');
    expect(getGame('euchre').href).toBe('/euchre');
    expect(getGame('hearts').href).toBe('/hearts');
    expect(getGame('gin').href).toBe('/gin');
    expect(getGame('president').href).toBe('/president');
    expect(getGame('klondike').href).toBe('/klondike');
    expect(getGame('golf').href).toBe('/golf');
    expect(getGame('freecell').href).toBe('/freecell');
    expect(getGame('spider').href).toBe('/spider');
    expect(getGame('pyramid').href).toBe('/pyramid');
  });

  it('every multi-seat shelf game has a friend room, and solitaire does not', () => {
    const SOLO_ONLY = new Set(['klondike', 'golf', 'freecell', 'spider', 'pyramid']);
    for (const game of GAMES) {
      if (SOLO_ONLY.has(game.id)) {
        expect(game.seats, game.id).toEqual([1]);
        expect(isMultiplayerGameId(game.gameId), game.id).toBe(false);
      } else {
        expect(
          game.seats.every((count) => count >= 2),
          game.id,
        ).toBe(true);
        expect(isMultiplayerGameId(game.gameId), game.id).toBe(true);
      }
    }
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
    expect(getGame('ratscrew')).toBe(ratscrewCatalog);
    expect(getGame('euchre')).toBe(euchreCatalog);
    expect(getGame('hearts')).toBe(heartsCatalog);
    expect(getGame('gin')).toBe(ginCatalog);
    expect(getGame('president')).toBe(presidentCatalog);
    expect(getGame('klondike')).toBe(klondikeCatalog);
    expect(getGame('golf')).toBe(golfCatalog);
    expect(getGame('freecell')).toBe(freecellCatalog);
    expect(getGame('spider')).toBe(spiderCatalog);
    expect(getGame('pyramid')).toBe(pyramidCatalog);
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
