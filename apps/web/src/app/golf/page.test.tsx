import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGolfSetupStore } from '@/stores/golfSetup';
import { useGolfStatsStore } from '@/stores/golfStats';
import GolfSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf' }));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useGolfSetupStore.setState({ mode: 'daily', run: null });
  useGolfStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<GolfSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('Golf setup', () => {
  it('offers daily, classic and fairway without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="golf-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() => click('golf-fairway'));
    act(() => click('start-golf'));

    expect(useGolfSetupStore.getState().run?.mode).toBe('fairway');
    expect(router.push).toHaveBeenCalledWith('/golf/table');
  });
});
