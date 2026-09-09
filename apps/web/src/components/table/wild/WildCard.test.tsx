import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WildCard } from './WildCard';

describe('WildCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('prints a colour card as its index', () => {
    act(() => {
      root.render(createElement(WildCard, { card: 'red-5-0' }));
    });
    expect(container.textContent).toContain('5');
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('red 5');
  });

  /*
   * The veiled face carries no colour, and a Wild card with no colour is the
   * colour changer — so every pickup in a veiled room flew to the hand wearing
   * the four-colour wheel and turned into the real card on landing.
   */
  it('shows a card it cannot read yet as a card back, not a wild', () => {
    act(() => {
      root.render(createElement(WildCard, { card: 'v#42' }));
    });
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(
      'Face-down card',
    );
    expect(container.textContent).not.toContain('?');
  });
});
