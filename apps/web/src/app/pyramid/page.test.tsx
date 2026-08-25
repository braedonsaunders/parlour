import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePyramidSetupStore } from '@/stores/pyramidSetup';
import { usePyramidStatsStore } from '@/stores/pyramidStats';
import PyramidSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/pyramid' }));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  usePyramidSetupStore.setState({ mode: 'daily', run: null });
  usePyramidStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<PyramidSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('Pyramid setup', () => {
  it('offers daily, classic and relaxed without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="pyramid-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() => click('pyramid-relaxed'));
    act(() => click('start-pyramid'));

    expect(usePyramidSetupStore.getState().run?.mode).toBe('relaxed');
    expect(router.push).toHaveBeenCalledWith('/pyramid/table');
  });
});
