import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';
import OhHellSetupPage from './page';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  usePathname: () => '/ohhell',
}));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

describe('Oh Hell setup page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useOhHellSetupStore.setState({ mode: 'classic', botTier: 2, seats: 4 });
    pushed.length = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('routes solo play to the Oh Hell table', () => {
    act(() => root.render(createElement(OhHellSetupPage)));
    const deal = container.querySelector<HTMLButtonElement>('[data-testid="deal-me-in"]')!;
    act(() => deal.click());
    expect(pushed).toEqual(['/ohhell/table']);
  });

  it('routes friend rooms to the Oh Hell lobby', () => {
    act(() => root.render(createElement(OhHellSetupPage)));
    const create = container.querySelector<HTMLButtonElement>(
      '[data-testid="create-ohhell-room"]',
    )!;
    act(() => create.click());
    expect(pushed).toEqual(['/ohhell/create']);
  });
});
