import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import styles from '@/styles/page-transition.module.css';
import { PageTransition } from './PageTransition';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

let container: HTMLDivElement;
let root: Root;

const shell = () => container.firstElementChild as HTMLElement;
const animating = () => shell().classList.contains(styles.enter!);

function render() {
  act(() => root.render(createElement(PageTransition, null, 'page')));
}

function finishAnimation() {
  act(() => {
    shell().dispatchEvent(new Event('animationend', { bubbles: true }));
  });
}

beforeEach(() => {
  nav.pathname = '/';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PageTransition', () => {
  it('settles the page in, then gets out of the way', () => {
    expect(animating()).toBe(true);

    finishAnimation();

    // The class carries a transform. Leaving it on — even at its identity
    // resting value — would make this wrapper the containing block for every
    // `position: fixed` descendant and re-anchor the corner chrome for good.
    expect(animating()).toBe(false);
  });

  it('re-arms on the next screen', () => {
    finishAnimation();
    nav.pathname = '/games';
    render();
    expect(animating()).toBe(true);
  });

  it('ignores an animation finishing somewhere inside the page', () => {
    const inner = document.createElement('div');
    shell().append(inner);

    act(() => {
      inner.dispatchEvent(new Event('animationend', { bubbles: true }));
    });

    expect(animating()).toBe(true);
  });

  it('leaves tables to the full-screen wipe', () => {
    nav.pathname = '/spades/table';
    render();
    expect(animating()).toBe(false);
  });
});
