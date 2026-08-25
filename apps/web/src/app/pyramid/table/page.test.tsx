import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePyramidRun } from '@/lib/pyramid/modes';
import { usePyramidSetupStore } from '@/stores/pyramidSetup';
import { usePyramidStatsStore } from '@/stores/pyramidStats';
import PyramidTablePage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  usePyramidSetupStore.setState({ mode: 'daily', run: null });
  usePyramidStatsStore.getState().reset();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
});

describe('Pyramid table route', () => {
  it('opens a deterministic daily run when linked directly', async () => {
    await act(async () => root.render(<PyramidTablePage />));
    const run = usePyramidSetupStore.getState().run;
    expect(run).toMatchObject({ mode: 'daily' });
    expect(run?.dailyKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(container.querySelector('[data-testid="pyramid-daily"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pyramid-new-deal"]')).toBeNull();
  });

  it('restarts the identical seed with a distinct local run id', async () => {
    const original = makePyramidRun('daily', {
      now: new Date('2026-08-24T12:00:00.000Z'),
      id: 'daily-original',
    });
    usePyramidSetupStore.setState({ mode: 'daily', run: original });
    await act(async () => root.render(<PyramidTablePage />));

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="pyramid-restart"]')!.click(),
    );
    expect(usePyramidSetupStore.getState().run).toMatchObject({
      mode: 'daily',
      dailyKey: original.dailyKey,
      seed: original.seed,
    });
    expect(usePyramidSetupStore.getState().run?.id).not.toBe(original.id);
  });

  it('offers a new seed only for non-daily runs', async () => {
    const original = makePyramidRun('classic', { randomSeed: 31, id: 'classic-original' });
    usePyramidSetupStore.setState({ mode: 'classic', run: original });
    await act(async () => root.render(<PyramidTablePage />));

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="pyramid-new-deal"]')!.click(),
    );
    const next = usePyramidSetupStore.getState().run;
    expect(next?.mode).toBe('classic');
    expect(next?.dailyKey).toBeNull();
    expect(next?.id).not.toBe(original.id);
  });
});
