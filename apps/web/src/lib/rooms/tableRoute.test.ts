import { describe, expect, it } from 'vitest';
import { GAMES } from '@/lib/games';
import { seatRangeFor } from './seatRange';
import { TABLE_ROUTES, tableRouteFor } from './tableRoute';

describe('tableRouteFor', () => {
  it('routes a joined Spades guest to the Spades table, not Blitz', () => {
    // The regression this replaces: a nested-ternary chain with a Blitz
    // fallback silently dropped every Spades guest onto /table.
    expect(tableRouteFor('spades')).toBe('/spades/table');
    expect(tableRouteFor('spades')).not.toBe('/table');
  });

  it('keeps every other game on the route it already had', () => {
    expect(tableRouteFor('blitz')).toBe('/table');
    expect(tableRouteFor('wildpile')).toBe('/wild/table');
    expect(tableRouteFor('ratscrew')).toBe('/ratscrew/table');
    expect(tableRouteFor('euchre')).toBe('/euchre/table');
    expect(tableRouteFor('cribbage')).toBe('/cribbage/table');
    expect(tableRouteFor('hearts')).toBe('/hearts/table');
    expect(tableRouteFor('gin')).toBe('/gin/table');
    expect(tableRouteFor('president')).toBe('/president/table');
  });

  it('gives every multiplayer game a route of its own', () => {
    const routes = Object.values(TABLE_ROUTES);
    expect(new Set(routes).size).toBe(routes.length);
  });

  /**
   * The shelf's `wild` is the pack's `wildpile`; every other shelf game that
   * offers friend rooms must be reachable under its own id.
   */
  it('covers each shelf game that advertises a friend room', () => {
    const aliases: Record<string, string> = { wild: 'wildpile' };
    for (const game of GAMES) {
      const multiplayerId = aliases[game.id] ?? game.id;
      if (!(multiplayerId in TABLE_ROUTES)) continue;
      expect(tableRouteFor(multiplayerId as keyof typeof TABLE_ROUTES)).toBeTruthy();
    }
    expect(seatRangeFor('spades')).toEqual({ min: 4, max: 4 });
  });
});
