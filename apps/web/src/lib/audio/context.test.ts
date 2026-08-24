import { describe, expect, it } from 'vitest';
import { resolveMusicContext } from './context';

describe('resolveMusicContext', () => {
  it('plays the menu theme on front-of-house routes', () => {
    const menuRoutes = [
      '/',
      '/games',
      '/play',
      '/profile',
      '/join',
      '/join/ABCD',
      '/create',
      '/wild',
      '/wild/create',
    ];
    for (const route of menuRoutes) {
      expect(resolveMusicContext(route), route).toBe('menu');
    }
  });

  it('plays scene playlists once a table is live and through the podium', () => {
    const gameRoutes = [
      '/table',
      '/table?room=X',
      '/wild/table',
      '/ratscrew/table',
      '/cribbage/table',
      '/euchre/table',
      '/hearts/table',
      '/gin/table',
      '/president/table',
      '/match-end',
    ];
    for (const route of gameRoutes) {
      expect(resolveMusicContext(route), route).toBe('game');
    }
  });

  it('classifies future nested table routes without updating an allowlist', () => {
    expect(resolveMusicContext('/future-game/table')).toBe('game');
    expect(resolveMusicContext('/future-game/table/replay')).toBe('game');
    expect(resolveMusicContext('/future-game/tabletop')).toBe('menu');
  });
});
