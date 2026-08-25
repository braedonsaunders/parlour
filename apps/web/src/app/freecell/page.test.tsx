import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFreecellSetupStore } from '@/stores/freecellSetup';
import { useFreecellStatsStore } from '@/stores/freecellStats';
import FreecellSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/freecell' }));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useFreecellSetupStore.setState({ mode: 'daily', run: null });
  useFreecellStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<FreecellSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('FreeCell setup', () => {
  it('offers daily, classic and relaxed without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="freecell-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() => click('freecell-relaxed'));
    act(() => click('start-freecell'));

    expect(useFreecellSetupStore.getState().run?.mode).toBe('relaxed');
    expect(router.push).toHaveBeenCalledWith('/freecell/table');
  });
});
