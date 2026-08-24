import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeKlondikeRun } from '@/lib/klondike/modes';
import { useKlondikeSetupStore } from '@/stores/klondikeSetup';
import { useKlondikeStatsStore } from '@/stores/klondikeStats';
import KlondikeTablePage from './page';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockReset();
  useKlondikeSetupStore.setState({ mode: 'daily', run: null, winnableOnly: false });
  useKlondikeStatsStore.getState().reset();
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

describe('Klondike table route', () => {
  it('opens a deterministic daily run when linked directly', async () => {
    await act(async () => root.render(<KlondikeTablePage />));
    const run = useKlondikeSetupStore.getState().run;
    expect(run).toMatchObject({ mode: 'daily' });
    expect(run?.dailyKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(container.querySelector('[data-testid="klondike-daily"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="klondike-new-deal"]')).toBeNull();
  });

  it('restarts the identical seed with a distinct local run id', async () => {
    const original = makeKlondikeRun('daily', {
      now: new Date('2026-08-24T12:00:00.000Z'),
      id: 'daily-original',
    });
    useKlondikeSetupStore.setState({ mode: 'daily', run: original });
    await act(async () => root.render(<KlondikeTablePage />));

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-restart"]')!.click(),
    );
    expect(useKlondikeSetupStore.getState().run).toMatchObject({
      mode: 'daily',
      dailyKey: original.dailyKey,
      seed: original.seed,
    });
    expect(useKlondikeSetupStore.getState().run?.id).not.toBe(original.id);
  });

  it('offers a new seed only for non-daily runs', async () => {
    const original = makeKlondikeRun('classic', { randomSeed: 31, id: 'classic-original' });
    useKlondikeSetupStore.setState({ mode: 'classic', run: original, winnableOnly: false });
    await act(async () => root.render(<KlondikeTablePage />));

    // Dealing is async now: a winnable-only table is searched for off-thread.
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-new-deal"]')!.click();
    });
    const next = useKlondikeSetupStore.getState().run;
    expect(next?.mode).toBe('classic');
    expect(next?.dailyKey).toBeNull();
    expect(next?.id).not.toBe(original.id);
  });

  it('deals a proven table when winnable-only is on', async () => {
    const original = makeKlondikeRun('classic', { randomSeed: 31, id: 'classic-original' });
    useKlondikeSetupStore.setState({ mode: 'classic', run: original, winnableOnly: true });
    await act(async () => root.render(<KlondikeTablePage />));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-new-deal"]')!.click();
    });
    const next = useKlondikeSetupStore.getState().run;
    expect(next?.id).not.toBe(original.id);
    expect(next?.winnable).toBe(true);
  }, 60_000);
});
