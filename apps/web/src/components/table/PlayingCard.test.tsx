import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayingCard } from './PlayingCard';

describe('PlayingCard', () => {
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

  it('prints a standard id as rank and suit', () => {
    act(() => {
      root.render(createElement(PlayingCard, { card: 'S12' }));
    });
    expect(container.textContent).toContain('Q');
    expect(container.textContent).toContain('♠');
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Q of spades');
  });

  it('prints a pinochle copy id as rank and suit, not the copy suffix', () => {
    act(() => {
      root.render(createElement(PlayingCard, { card: 'SQ-1' }));
    });
    expect(container.textContent).not.toContain('Q-1');
    expect(container.textContent).toContain('Q');
    expect(container.textContent).toContain('♠');
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Q of spades');
  });

  it('prints a pinochle ten without eating the rank', () => {
    act(() => {
      root.render(createElement(PlayingCard, { card: 'H10-0' }));
    });
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('♥');
    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(
      '10 of hearts',
    );
  });
});
