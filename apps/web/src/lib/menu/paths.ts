import { isTableRoute, normalizePath, routeOfHref } from '@/lib/transitions/tableWipe';

export type MenuDirection = 'forward' | 'back';

/**
 * Front-of-house screens that should swap like an SPA: home, the shelf, and
 * every game's mode/setup page. Tables, create lobbies, and join stay on the
 * Next router because those need a real URL for rooms and the wipe.
 */
export const MENU_VIEW_ROUTES = [
  '/',
  '/games',
  '/play',
  '/cribbage',
  '/wild',
  '/eights',
  '/ratscrew',
  '/euchre',
  '/spades',
  '/poker',
  '/ohhell',
  '/scopa',
  '/spite',
  '/klondike',
  '/golf',
  '/freecell',
  '/spider',
  '/pyramid',
  '/hearts',
  '/gin',
  '/president',
] as const;

const MENU_VIEW_SET = new Set<string>(MENU_VIEW_ROUTES);

export function isMenuViewRoute(pathname: string): boolean {
  return MENU_VIEW_SET.has(normalizePath(pathname));
}

export function menuPath(href: string): string {
  return routeOfHref(href);
}

/** How deep a menu screen sits, so a bare popstate can still pick a direction. */
export function menuDepth(pathname: string): number {
  const route = normalizePath(pathname);
  if (route === '/') return 0;
  if (route === '/games' || route === '/join' || route === '/profile') return 1;
  if (isMenuViewRoute(route)) return 2;
  if (isTableRoute(route)) return 4;
  return 1 + route.split('/').filter(Boolean).length;
}

export function inferMenuDirection(from: string, to: string): MenuDirection {
  return menuDepth(to) < menuDepth(from) ? 'back' : 'forward';
}

export { normalizePath };
