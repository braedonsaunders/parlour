import { describe, expect, it } from 'vitest';
import { MULTIPLAYER_GAME_IDS } from './gameIds';
import { hasValidSeatCount, seatRangeFor } from './seatRange';
import { TABLE_ROUTES } from './tableRoute';
import { ALL_ROOM_GAMES, findRoomGame, roomGame, ROOM_GAMES, seatRefusal } from './gameRegistry';

/**
 * The registry exists to make "forgot to add game N to one of the tables" a
 * compile error rather than a silent Blitz. Most of that guarantee is the type
 * system's job; these cover the parts it cannot express — that nothing falls
 * back, and that the separate tables still agree with each other.
 */
describe('room game registry', () => {
  it('covers every multiplayer game id exactly once', () => {
    expect(Object.keys(ROOM_GAMES).sort()).toEqual([...MULTIPLAYER_GAME_IDS].sort());
    expect(ALL_ROOM_GAMES).toHaveLength(MULTIPLAYER_GAME_IDS.length);
  });

  it('refuses an unknown game instead of falling back to Blitz', () => {
    // The bug this replaces: `return createBlitzDef()` at the end of a chain,
    // which loaded Blitz's rules into a room announced as something else.
    expect(() => roomGame('bridge')).toThrow(/unsupported room game: bridge/);
    expect(() => roomGame('')).toThrow(/unsupported room game/);
    // Solitaire is single-seat and deliberately has no room at all; it must be
    // refused here rather than quietly seated at a Blitz table.
    expect(() => roomGame('klondike')).toThrow(/unsupported room game: klondike/);
    expect(findRoomGame('bridge')).toBeNull();
    expect(findRoomGame(null)).toBeNull();
    expect(findRoomGame(undefined)).toBeNull();
  });

  it('never resolves one game to another game', () => {
    for (const id of MULTIPLAYER_GAME_IDS) expect(roomGame(id).id).toBe(id);
  });

  it('agrees with the seat-range and route tables', () => {
    for (const pack of ALL_ROOM_GAMES) {
      expect(pack.seats).toEqual(seatRangeFor(pack.id));
      expect(pack.route).toBe(TABLE_ROUTES[pack.id]);
    }
  });

  it('declares a seat ring the game can actually seat', () => {
    for (const pack of ALL_ROOM_GAMES) {
      const { min, max } = pack.seats;
      expect(min).toBeGreaterThanOrEqual(2);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(hasValidSeatCount(pack.id, min)).toBe(true);
      expect(hasValidSeatCount(pack.id, max)).toBe(true);
      expect(hasValidSeatCount(pack.id, min - 1)).toBe(false);
      expect(hasValidSeatCount(pack.id, max + 1)).toBe(false);
    }
  });

  it('resolves a config for every game, and resolving is a fixed point', () => {
    for (const pack of ALL_ROOM_GAMES) {
      const config = pack.resolveConfig({});
      expect(config).toBeTypeOf('object');
      // A non-idempotent resolve would make the authority reject the room's own
      // settings on snapshot import.
      expect(pack.resolveConfig(config)).toEqual(config);
    }
  });

  it('names itself in its own refusal messages', () => {
    for (const pack of ALL_ROOM_GAMES) {
      expect(seatRefusal(pack)).toContain(pack.name);
      if (pack.veilRefusal) expect(pack.veilRefusal).toContain(pack.name);
    }
  });

  it('only offers Veil where the pack actually supports it', () => {
    for (const pack of ALL_ROOM_GAMES) {
      // A pack that accepts veiled rooms must carry the engine-side support
      // block; one that refuses must say why. "No veil block and no refusal"
      // would be a room that advertises a privacy tier and then throws mid-deal.
      if (pack.veilRefusal === null) expect(pack.veilSupport()).not.toBeNull();
      else expect(pack.veilRefusal.length).toBeGreaterThan(0);
    }
  });

  it('reports recyclable stock only for the games that re-veil a discard', () => {
    const spent = { stock: [], discard: ['S1', 'S2', 'S3'] };
    expect(ROOM_GAMES.blitz.recyclableStock(spent, 'draw.stock')).toEqual(['S2', 'S3']);
    expect(ROOM_GAMES.blitz.recyclableStock(spent, 'knock')).toBeNull();
    expect(ROOM_GAMES.wildpile.recyclableStock(spent, 'draw')).toEqual(['S2', 'S3']);
    expect(ROOM_GAMES.hearts.recyclableStock(spent, 'playCard')).toBeNull();
    expect(ROOM_GAMES.spades.recyclableStock(spent, 'playCard')).toBeNull();
  });

  it('does not recycle a stock with cards left, or one already hidden', () => {
    const blitz = ROOM_GAMES.blitz;
    expect(
      blitz.recyclableStock({ stock: ['S4'], discard: ['S1', 'S2'] }, 'draw.stock'),
    ).toBeNull();
    expect(blitz.recyclableStock({ stock: [], discard: ['S1'] }, 'draw.stock')).toBeNull();
    expect(
      blitz.recyclableStock({ stock: [], discard: ['S1', 'v#7', 'v#8'] }, 'draw.stock'),
    ).toBeNull();
  });
});
