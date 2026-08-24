/** Which soundtrack pool a route should play. */
export type MusicContext = 'menu' | 'game';

/**
 * Live game surfaces (scene playlists, tense packs); everything else — home,
 * shelves, setup screens, lobbies — plays the pack's menu theme.
 */
const GAME_ROUTE_PREFIXES = ['/table', '/wild/table', '/match-end'];

export function resolveMusicContext(pathname: string): MusicContext {
  return GAME_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ? 'game' : 'menu';
}
