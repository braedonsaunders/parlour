/**
 * Route classification for the table-entry wipe.
 *
 * Pure and client-safe: no React, no router imports, so both the navigation
 * hook and tests can share one definition of what "going to a table" means.
 */

export const TABLE_WIPE_ROUTES: readonly (readonly [route: string, gameId: string])[] = [
  ['/table', 'blitz'],
  ['/klondike/table', 'klondike'],
  ['/cribbage/table', 'cribbage'],
  ['/wild/table', 'wild'],
  ['/ratscrew/table', 'ratscrew'],
  ['/euchre/table', 'euchre'],
  ['/hearts/table', 'hearts'],
  ['/gin/table', 'gin'],
  ['/president/table', 'president'],
  ['/spades/table', 'spades'],
  ['/ohhell/table', 'ohhell'],
  ['/spite/table', 'spite'],
  ['/scopa/table', 'scopa'],
];

const ROUTE_GAME = new Map(TABLE_WIPE_ROUTES);

/** Trailing-slash-insensitive path compare (static export serves `/x/`). */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function isTableRoute(pathname: string): boolean {
  return ROUTE_GAME.has(normalizePath(pathname));
}

/** Shelf game id for a table route, or null for non-table paths. */
export function tableGameIdFor(pathname: string): string | null {
  return ROUTE_GAME.get(normalizePath(pathname)) ?? null;
}

/** Strips query/hash so `push('/spades/table?x')` still classifies as a table. */
export function routeOfHref(href: string): string {
  return normalizePath(href.split(/[?#]/, 1)[0] ?? href);
}

/**
 * Cover must include the slowest staggered panel; hold is the emblem beat;
 * safety bounds how long we wait for Next to swap routes before revealing.
 */
export const WIPE_TIMINGS = {
  coverMs: 560,
  holdMs: 800,
  arrivalSafetyMs: 900,
  revealMs: 700,
} as const;

/** Honors both the OS setting and the in-app comfort toggle (html.reduce-motion). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  return media?.matches === true || document.documentElement.classList.contains('reduce-motion');
}
