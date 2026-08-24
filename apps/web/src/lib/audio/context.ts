/** Which soundtrack pool a route should play. */
export type MusicContext = 'menu' | 'game';

/**
 * Live game surfaces (scene playlists, mood cues); everything else — home,
 * shelves, setup screens, lobbies — plays the pack's menu theme.
 */
export function resolveMusicContext(pathname: string): MusicContext {
  const route = pathname.split('?')[0] ?? pathname;
  const isTable = /(^|\/)table(?:\/|$)/.test(route);
  const isMatchEnd = route === '/match-end' || route.startsWith('/match-end/');
  return isTable || isMatchEnd ? 'game' : 'menu';
}
