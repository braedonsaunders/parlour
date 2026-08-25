import { describe, expect, it } from 'vitest';
import { GAMES } from '@/lib/games/shelf';
import {
  MENU_VIEW_ROUTES,
  inferMenuDirection,
  isMenuViewRoute,
  menuDepth,
  menuPath,
} from './paths';
import { MENU_VIEW_LOADERS } from './views';

describe('menu view routes', () => {
  it('covers home, the shelf, and every shipped game setup page', () => {
    expect(isMenuViewRoute('/')).toBe(true);
    expect(isMenuViewRoute('/games/')).toBe(true);
    for (const game of GAMES) {
      const href = game.href;
      expect(href, `${game.id} is missing a setup href`).toBeTruthy();
      if (!href) continue;
      expect(isMenuViewRoute(href)).toBe(true);
    }
  });

  it('keeps a loader for every menu view so a tap can mount without Next', () => {
    expect(Object.keys(MENU_VIEW_LOADERS).sort()).toEqual([...MENU_VIEW_ROUTES].sort());
  });

  it('leaves tables and lobbies on the real router', () => {
    expect(isMenuViewRoute('/eights/table')).toBe(false);
    expect(isMenuViewRoute('/eights/create')).toBe(false);
    expect(isMenuViewRoute('/join')).toBe(false);
  });

  it('reads depth so a bare popstate still knows forward from back', () => {
    expect(menuDepth('/')).toBe(0);
    expect(menuDepth('/games')).toBe(1);
    expect(menuDepth('/eights')).toBe(2);
    expect(menuDepth('/eights/create')).toBe(3);
    expect(inferMenuDirection('/games', '/eights')).toBe('forward');
    expect(inferMenuDirection('/eights', '/games')).toBe('back');
    expect(menuPath('/wild/?x=1')).toBe('/wild');
  });
});
