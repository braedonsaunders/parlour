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
    for (const route of ['/table', '/table?room=X', '/wild/table', '/match-end']) {
      expect(resolveMusicContext(route), route).toBe('game');
    }
  });
});
