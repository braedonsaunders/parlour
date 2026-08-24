import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWipeStore } from '@/stores/wipe';
import { WipeOverlay } from './WipeOverlay';

const nav = vi.hoisted(() => ({ pathname: '/spades' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

let container: HTMLDivElement;
let root: Root;

const overlay = () => container.querySelector('[data-testid="wipe-overlay"]');

beforeEach(() => {
  nav.pathname = '/spades';
  useWipeStore.setState({ status: 'idle', target: null, origin: null, arrived: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(WipeOverlay)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WipeOverlay', () => {
  it('costs nothing on a session that never opens a table', () => {
    expect(overlay()).toBeNull();
  });

  it('names the table it is carrying you to', () => {
    act(() => {
      useWipeStore.getState().begin('/spades/table', '/spades');
    });

    const shown = overlay();
    expect(shown).not.toBeNull();
    expect(shown?.getAttribute('data-status')).toBe('cover');
    expect(shown?.textContent).toContain('Spades');
    expect(shown?.textContent).toContain('the partner game');
  });

  it('tracks the status the sequence is driving', () => {
    act(() => {
      useWipeStore.getState().begin('/gin/table', '/gin');
    });
    act(() => useWipeStore.getState().markCovered());
    expect(overlay()?.getAttribute('data-status')).toBe('covered');

    act(() => useWipeStore.getState().beginReveal());
    expect(overlay()?.getAttribute('data-status')).toBe('reveal');

    act(() => useWipeStore.getState().clear());
    expect(overlay()).toBeNull();
  });

  it('reports the landing once the route swaps underneath it', () => {
    act(() => {
      useWipeStore.getState().begin('/gin/table', '/gin');
    });
    expect(useWipeStore.getState().arrived).toBe(false);

    nav.pathname = '/gin/table';
    act(() => root.render(createElement(WipeOverlay)));
    expect(useWipeStore.getState().arrived).toBe(true);
  });

  it('reports the landing immediately on a play-again, which never leaves', () => {
    nav.pathname = '/gin/table';
    act(() => root.render(createElement(WipeOverlay)));

    act(() => {
      useWipeStore.getState().begin('/gin/table', '/gin/table');
    });

    // `begin` clears the flag; the overlay is already standing on the target,
    // so it re-reports at once rather than burning the whole safety window.
    expect(useWipeStore.getState().arrived).toBe(true);
  });
});
