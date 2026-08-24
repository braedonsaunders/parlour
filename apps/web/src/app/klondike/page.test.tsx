import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKlondikeSetupStore } from '@/stores/klondikeSetup';
import { useKlondikeStatsStore } from '@/stores/klondikeStats';
import KlondikeSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/klondike' }));

// The table wipe is presentational and holds the navigation for its own beat;
// this test is about where the button goes. `runTableWipe.test.ts` owns the
// timing.
vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useKlondikeSetupStore.setState({ mode: 'daily', run: null });
  useKlondikeStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<KlondikeSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Klondike setup', () => {
  it('offers daily, classic and relaxed without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="klondike-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
    expect(container.textContent).toMatch(/may not be solvable/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() =>
      (container.querySelector('[data-testid="klondike-relaxed"]') as HTMLButtonElement).click(),
    );
    act(() =>
      (container.querySelector('[data-testid="start-klondike"]') as HTMLButtonElement).click(),
    );
    expect(useKlondikeSetupStore.getState().run?.mode).toBe('relaxed');
    expect(router.push).toHaveBeenCalledWith('/klondike/table');
  });
});
