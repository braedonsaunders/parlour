import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { resetMusicControllerForTests } from '@/lib/audio/MusicController';
import { resetMenuNavForTests, useMenuNavStore } from '@/stores/menuNav';
import { navigateMenu } from './navigate';

const freeze = vi.hoisted(() => ({ on: false }));

vi.mock('@/lib/menu/history', async () => {
  const actual = await vi.importActual<typeof import('@/lib/menu/history')>('@/lib/menu/history');
  return {
    ...actual,
    freezesMenuDocument: () => freeze.on,
    pushFrozenMenu: vi.fn(actual.pushFrozenMenu),
  };
});

vi.mock('@/lib/menu/views', () => ({
  prefetchMenuView: vi.fn(() => Promise.resolve(null)),
}));

import { pushFrozenMenu } from '@/lib/menu/history';
import { prefetchMenuView } from '@/lib/menu/views';

describe('navigateMenu', () => {
  beforeEach(() => {
    freeze.on = false;
    resetMenuNavForTests();
    resetAudioManagerForTests();
    resetMusicControllerForTests();
    vi.mocked(pushFrozenMenu).mockClear();
    vi.mocked(prefetchMenuView).mockClear();
  });

  afterEach(() => {
    freeze.on = false;
    resetMenuNavForTests();
    resetAudioManagerForTests();
    resetMusicControllerForTests();
  });

  it('swaps the cached menu view and pushes the Next route in a browser', () => {
    const push = vi.fn();
    const prefetch = vi.fn();
    navigateMenu({ push, prefetch }, '/games', 'forward');

    expect(useMenuNavStore.getState()).toMatchObject({
      active: true,
      frozen: false,
      displayPath: '/games',
      direction: 'forward',
    });
    expect(prefetchMenuView).toHaveBeenCalledWith('/games');
    expect(prefetch).toHaveBeenCalledWith('/games');
    expect(push).toHaveBeenCalledWith('/games');
    expect(pushFrozenMenu).not.toHaveBeenCalled();
  });

  it('freezes the document URL on an iOS PWA so the theme is not killed', () => {
    freeze.on = true;
    const push = vi.fn();
    navigateMenu({ push }, '/eights', 'forward');

    expect(useMenuNavStore.getState()).toMatchObject({
      active: true,
      frozen: true,
      displayPath: '/eights',
    });
    expect(pushFrozenMenu).toHaveBeenCalledWith('/eights', '/');
    expect(push).not.toHaveBeenCalled();
  });

  it('hands tables and lobbies back to the real router', () => {
    const push = vi.fn();
    useMenuNavStore.getState().show('/eights', 'forward');
    navigateMenu({ push }, '/eights/table', 'forward');

    expect(useMenuNavStore.getState().active).toBe(false);
    expect(push).toHaveBeenCalledWith('/eights/table');
    expect(pushFrozenMenu).not.toHaveBeenCalled();
  });
});
