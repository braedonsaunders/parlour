import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMenuNavForTests, useMenuNavStore } from '@/stores/menuNav';
import { PageTransition } from './PageTransition';

let container: HTMLDivElement;
let root: Root;

const shell = () => container.firstElementChild as HTMLElement;

function render(route?: string) {
  act(() => root.render(<PageTransition route={route}>page</PageTransition>));
}

beforeEach(() => {
  resetMenuNavForTests();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetMenuNavForTests();
});

describe('PageTransition', () => {
  it('keeps a still full-viewport shell so Windows does not promote it over the scene', () => {
    expect(shell().className).toBe('relative z-10 min-h-dvh');
    expect(shell().textContent).toBe('page');
  });

  it('does not arm motion when the menu stack hops', () => {
    useMenuNavStore.getState().show('/games', 'forward');
    render('/games');
    expect(shell().className).toBe('relative z-10 min-h-dvh');

    useMenuNavStore.getState().show('/', 'back');
    render('/');
    expect(shell().className).toBe('relative z-10 min-h-dvh');
  });
});
