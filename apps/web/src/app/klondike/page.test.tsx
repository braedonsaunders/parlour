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
  useKlondikeSetupStore.setState({ mode: 'daily', run: null, winnableOnly: false });
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

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('Klondike setup', () => {
  it('offers daily, classic and relaxed without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="klondike-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', async () => {
    act(() => click('klondike-relaxed'));
    await act(async () => click('start-klondike'));

    expect(useKlondikeSetupStore.getState().run?.mode).toBe('relaxed');
    expect(router.push).toHaveBeenCalledWith('/klondike/table');
  });

  it('parks the winnable-only thumb on the left when off', async () => {
    const thumbClass = () =>
      container.querySelector('[data-testid="klondike-winnable-only"] [aria-hidden="true"] > span')
        ?.className ?? '';

    expect(thumbClass()).toMatch(/left-0\.5/);
    expect(thumbClass()).toMatch(/translate-x-0(?!\.|\d)/);
    expect(thumbClass()).not.toMatch(/translate-x-4/);

    await act(async () => click('klondike-winnable-only'));

    expect(thumbClass()).toMatch(/left-0\.5/);
    expect(thumbClass()).toMatch(/translate-x-4/);
  });

  it('owns the dead-deal caveat only while winnable-only is off', async () => {
    expect(container.textContent).toMatch(/one table in five cannot be cleared/i);

    await act(async () => click('klondike-winnable-only'));

    expect(useKlondikeSetupStore.getState().winnableOnly).toBe(true);
    expect(container.textContent).not.toMatch(/cannot be cleared/i);
    expect(container.textContent).toMatch(/checked all the way through/i);
  });

  it('deals a proven table when winnable-only is on', async () => {
    await act(async () => click('klondike-winnable-only'));
    act(() => click('klondike-relaxed'));
    await act(async () => click('start-klondike'));

    expect(useKlondikeSetupStore.getState().run?.winnable).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/klondike/table');
  }, 60_000);
});
