import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpiderSetupStore } from '@/stores/spiderSetup';
import { useSpiderStatsStore } from '@/stores/spiderStats';
import SpiderSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/spider' }));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useSpiderSetupStore.setState({ mode: 'daily', run: null });
  useSpiderStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<SpiderSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('Spider setup', () => {
  it('offers daily, relaxed, classic and hard without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="spider-"][role="radio"]')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() => click('spider-hard'));
    act(() => click('start-spider'));

    expect(useSpiderSetupStore.getState().run?.mode).toBe('hard');
    expect(router.push).toHaveBeenCalledWith('/spider/table');
  });
});
