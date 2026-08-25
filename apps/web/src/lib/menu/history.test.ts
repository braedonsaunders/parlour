import { afterEach, describe, expect, it, vi } from 'vitest';
import { freezesMenuDocument, pushFrozenMenu, readFrozenMenuPath } from './history';

describe('frozen menu history', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('only freezes the document inside an iOS standalone window', () => {
    const standalone = {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
      },
      matchMedia: () => ({ matches: true }),
    } as unknown as Window;

    const safariTab = {
      ...standalone,
      navigator: { ...standalone.navigator, standalone: false },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;

    expect(freezesMenuDocument(standalone, standalone.navigator)).toBe(true);
    expect(freezesMenuDocument(safariTab, safariTab.navigator)).toBe(false);
  });

  it('grows a same-document stack so Back still pops', () => {
    const replaceState = vi.fn();
    const pushState = vi.fn();
    vi.stubGlobal('window', {
      history: { state: { __na: 'next' }, replaceState, pushState },
    });

    pushFrozenMenu('/games', '/');

    expect(replaceState).toHaveBeenCalledWith({ __na: 'next', parlourMenu: '/' }, '');
    expect(pushState).toHaveBeenCalledWith({ __na: 'next', parlourMenu: '/games' }, '');
    expect(readFrozenMenuPath({ parlourMenu: '/eights' })).toBe('/eights');
    expect(readFrozenMenuPath(null)).toBeNull();
  });
});
