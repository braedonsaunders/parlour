import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScopaSetupStore } from '@/stores/scopaSetup';
import ScopaSetupPage from './page';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  usePathname: () => '/scopa',
}));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

describe('Scopa setup page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useScopaSetupStore.setState({ mode: 'classic', botTier: 2, seats: 4 });
    pushed.length = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('routes solo play to the Scopa table', () => {
    act(() => root.render(createElement(ScopaSetupPage)));
    const deal = container.querySelector<HTMLButtonElement>('[data-testid="deal-me-in"]')!;
    act(() => deal.click());
    expect(pushed).toEqual(['/scopa/table']);
  });

  it('routes friend rooms to the Scopa lobby', () => {
    act(() => root.render(createElement(ScopaSetupPage)));
    const create = container.querySelector<HTMLButtonElement>('[data-testid="create-scopa-room"]')!;
    act(() => create.click());
    expect(pushed).toEqual(['/scopa/create']);
  });
});
