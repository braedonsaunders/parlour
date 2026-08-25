import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMenuNavForTests, useMenuNavStore } from '@/stores/menuNav';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, prefetch: () => {} }),
}));

vi.mock('@/lib/menu/views', () => ({
  useMenuView: (path: string) => {
    if (path === '/games') {
      return createElement('div', { 'data-testid': 'cached-games' }, 'shelf');
    }
    return null;
  },
}));

import { MenuShell } from './MenuShell';

let container: HTMLDivElement;
let root: Root;

function render(child = 'home') {
  act(() => root.render(createElement(MenuShell, null, child)));
}

beforeEach(() => {
  nav.pathname = '/';
  resetMenuNavForTests();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetMenuNavForTests();
});

describe('MenuShell', () => {
  it('keeps the hydrated page until a menu tap swaps the cached view', () => {
    render();
    expect(container.textContent).toContain('home');
    expect(container.querySelector('[data-testid="cached-games"]')).toBeNull();

    act(() => {
      useMenuNavStore.getState().show('/games', 'forward');
    });
    render();
    expect(container.querySelector('[data-testid="cached-games"]')).not.toBeNull();
    expect(container.textContent).not.toContain('home');
  });

  it('hands create and join routes back to Next so those buttons are not swallowed', () => {
    act(() => {
      useMenuNavStore.getState().show('/games', 'forward');
    });
    nav.pathname = '/games';
    render('shelf');
    expect(container.querySelector('[data-testid="cached-games"]')).not.toBeNull();

    nav.pathname = '/eights/create';
    render('create-lobby');
    expect(container.textContent).toContain('create-lobby');
    expect(container.querySelector('[data-testid="cached-games"]')).toBeNull();
    expect(useMenuNavStore.getState().active).toBe(false);

    nav.pathname = '/join';
    render('join-table');
    expect(container.textContent).toContain('join-table');
    expect(container.querySelector('[data-testid="cached-games"]')).toBeNull();
  });

  it('pops a frozen iOS history entry back to the previous menu', () => {
    act(() => {
      useMenuNavStore.getState().show('/games', 'forward', true);
    });
    render();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { parlourMenu: '/' } }));
    });

    expect(useMenuNavStore.getState()).toMatchObject({
      displayPath: '/',
      direction: 'back',
      frozen: true,
    });
  });
});
