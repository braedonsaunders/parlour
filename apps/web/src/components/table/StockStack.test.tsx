import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StockStack, stockStackDepth } from './StockStack';

describe('stockStackDepth', () => {
  it('thins the deck as the stock runs down', () => {
    expect(stockStackDepth(0)).toBe(0);
    expect(stockStackDepth(1)).toBe(1);
    expect(stockStackDepth(4)).toBe(2);
    expect(stockStackDepth(12)).toBe(3);
    expect(stockStackDepth(28)).toBe(4);
    expect(stockStackDepth(29)).toBe(5);
    expect(stockStackDepth(80)).toBe(5);
  });
});

describe('StockStack', () => {
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

  it('marks the visible top face for flight origins', () => {
    act(() => {
      root.render(createElement(StockStack, { count: 40 }, createElement('span', null, 'top')));
    });
    const stack = container.querySelector('[data-stack-depth]');
    expect(stack?.getAttribute('data-stack-depth')).toBe('5');
    expect(stack?.querySelector('[data-zone-face]')?.textContent).toContain('top');
    expect(stack?.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(1);
  });

  it('keeps an empty well when the stock is gone', () => {
    act(() => {
      root.render(createElement(StockStack, { count: 0 }, createElement('span', null, 'top')));
    });
    expect(container.querySelector('[data-zone-face]')).not.toBeNull();
    expect(container.querySelector('[data-stack-depth]')).toBeNull();
    expect(container.textContent).not.toContain('top');
  });
});
