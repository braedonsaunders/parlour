import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPADES_MODES } from '@/lib/spades/modes';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import modeStyles from '@/styles/modes.module.css';
import SpadesSetupPage from './page';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
}));

describe('Spades setup page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    useSpadesSetupStore.setState({ mode: 'classic', botTier: 2 });
    pushed.length = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('offers every shipped mode, and no blind nil', () => {
    act(() => root.render(createElement(SpadesSetupPage)));
    const tiles = [...container.querySelectorAll(`.${modeStyles.tile}`)];
    expect(tiles).toHaveLength(SPADES_MODES.length);
    expect(container.textContent).toContain('Classic');
    expect(container.textContent).toContain('Quick');
    expect(container.textContent).toContain('Clean Books');
    expect(container.textContent?.toLowerCase()).not.toContain('blind');
  });

  it('routes solo play to the Spades table', () => {
    act(() => root.render(createElement(SpadesSetupPage)));
    const deal = container.querySelector<HTMLButtonElement>('[data-testid="deal-me-in"]')!;
    act(() => deal.click());
    expect(pushed).toEqual(['/spades/table']);
  });

  it('routes friend rooms to the Spades lobby', () => {
    act(() => root.render(createElement(SpadesSetupPage)));
    const create = container.querySelector<HTMLButtonElement>(
      '[data-testid="create-spades-room"]',
    )!;
    act(() => create.click());
    expect(pushed).toEqual(['/spades/create']);
  });

  it('persists the chosen mode for the table and lobby to read', () => {
    act(() => root.render(createElement(SpadesSetupPage)));
    const tiles = [...container.querySelectorAll<HTMLButtonElement>(`.${modeStyles.tile}`)];
    const quick = tiles[SPADES_MODES.findIndex((mode) => mode.id === 'quick')]!;
    act(() => quick.click());
    expect(useSpadesSetupStore.getState().mode).toBe('quick');
  });

  it('says four seats are required rather than promising bot fill', () => {
    act(() => root.render(createElement(SpadesSetupPage)));
    const copy = container.textContent ?? '';
    expect(copy).toContain('two partnerships');
    expect(copy).not.toContain('reclaim');
  });
});
