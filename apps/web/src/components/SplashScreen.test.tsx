import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SplashScreen } from './SplashScreen';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('SplashScreen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    vi.useRealTimers();
  });

  it('dismisses from the full-screen desktop button', async () => {
    await act(async () => root.render(createElement(SplashScreen)));

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="splash-screen-dismiss"]',
    );
    expect(button?.getAttribute('aria-label')).toBe('Continue to Parlour');

    act(() => button?.click());
    expect(container.querySelector('[data-testid="splash-screen"]')?.className).toContain(
      'leaving',
    );

    act(() => vi.advanceTimersByTime(551));
    expect(container.querySelector('[data-testid="splash-screen"]')).toBeNull();
  });
});
