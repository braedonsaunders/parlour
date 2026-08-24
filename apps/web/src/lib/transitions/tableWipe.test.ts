import { describe, expect, it } from 'vitest';
import { TABLE_ROUTES } from '@/lib/rooms/tableRoute';
import { GAMES } from '@/lib/games';
import {
  isTableRoute,
  normalizePath,
  routeOfHref,
  TABLE_WIPE_ROUTES,
  tableGameIdFor,
} from './tableWipe';

describe('table wipe routes', () => {
  it('recognises every table a guest can be sent to', () => {
    // The join page drops guests straight onto a table when the host deals.
    // A game missing here would land without the wipe — a hard cut mid-match.
    for (const route of Object.values(TABLE_ROUTES)) {
      expect(isTableRoute(route)).toBe(true);
    }
  });

  it('names a shelf game for every route it claims', () => {
    const shelf = new Set(GAMES.map((game) => game.id));
    for (const [route, gameId] of TABLE_WIPE_ROUTES) {
      expect(shelf, `${route} names an unshelved game`).toContain(gameId);
    }
  });

  it('leaves the rest of the app alone', () => {
    for (const route of ['/', '/games', '/play', '/spades', '/spades/create', '/match-end']) {
      expect(isTableRoute(route)).toBe(false);
      expect(tableGameIdFor(route)).toBeNull();
    }
  });

  it('matches the trailing slash the static export serves', () => {
    expect(normalizePath('/gin/table/')).toBe('/gin/table');
    expect(normalizePath('/')).toBe('/');
    expect(isTableRoute('/gin/table/')).toBe(true);
  });

  it('classifies a destination by its path, not its query', () => {
    expect(routeOfHref('/spades/table?seat=2')).toBe('/spades/table');
    expect(routeOfHref('/spades/table#top')).toBe('/spades/table');
    expect(isTableRoute(routeOfHref('/spades/table?seat=2'))).toBe(true);
  });
});
