import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpiteSetupStore } from '@/stores/spiteSetup';
import SpiteSetupPage from './page';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  usePathname: () => '/spite',
}));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

describe('Spite setup page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useSpiteSetupStore.setState({ mode: 'classic', botTier: 2, seats: 2 });
    pushed.length = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('routes solo play to the Spite table', () => {
    act(() => root.render(createElement(SpiteSetupPage)));
    const deal = container.querySelector<HTMLButtonElement>('[data-testid="deal-me-in"]')!;
    act(() => deal.click());
    expect(pushed).toEqual(['/spite/table']);
  });

  it('routes friend rooms to the Spite lobby', () => {
    act(() => root.render(createElement(SpiteSetupPage)));
    const create = container.querySelector<HTMLButtonElement>('[data-testid="create-spite-room"]')!;
    act(() => create.click());
    expect(pushed).toEqual(['/spite/create']);
  });
});
