import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTripeaksSetupStore } from '@/stores/tripeaksSetup';
import { useTripeaksStatsStore } from '@/stores/tripeaksStats';
import TripeaksSetupPage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/tripeaks' }));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useTripeaksSetupStore.setState({ mode: 'daily', run: null });
  useTripeaksStatsStore.getState().reset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<TripeaksSetupPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function click(testId: string) {
  return (container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

describe('TriPeaks setup', () => {
  it('offers daily, classic and relaxed without multiplayer copy', () => {
    expect(container.querySelectorAll('[data-testid^="tripeaks-"][role="radio"]')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/friend room|join|bot/i);
  });

  it('starts the selected fresh mode and routes to the solo table', () => {
    act(() => click('tripeaks-relaxed'));
    act(() => click('start-tripeaks'));

    expect(useTripeaksSetupStore.getState().run?.mode).toBe('relaxed');
    expect(router.push).toHaveBeenCalledWith('/tripeaks/table');
  });
});
