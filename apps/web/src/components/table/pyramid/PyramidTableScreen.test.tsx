import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesForPyramidMode } from '@/lib/pyramid/modes';
import { pyramidTableView, type PyramidTableView } from '@/lib/pyramid/view';
import { PyramidTransport } from '@/lib/solo/PyramidTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { PyramidTableScreen } from './PyramidTableScreen';

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'relaxed' = 'daily') {
  const transport = new PyramidTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForPyramidMode(mode),
  });
  return {
    transport,
    view: pyramidTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: PyramidTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(PyramidTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
  );
}

function textSurface(): Record<string, unknown> {
  return JSON.parse(
    (window as unknown as { render_game_to_text: () => string }).render_game_to_text(),
  ) as Record<string, unknown>;
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  useProfileStore.setState((state) => ({
    ...state,
    settings: { ...DEFAULT_PROFILE_SETTINGS },
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  container.remove();
  delete (window as unknown as { render_game_to_text?: () => string }).render_game_to_text;
});

describe('PyramidTableScreen', () => {
  it('renders the public pyramid and omits stock identities from text', () => {
    const { view } = table();
    render(view);
    expect(container.querySelectorAll('[data-testid^="pyramid-row-"]')).toHaveLength(7);
    const serialised = JSON.stringify(textSurface());
    expect(serialised).not.toContain('seed');
    expect(serialised).not.toContain('??');
    expect(textSurface()).toMatchObject({
      game: 'pyramid',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      leftover: 52,
    });
  });

  it('dispatches stock turns and keeps the daily table on the same pyramid', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    const onRestart = vi.fn();
    render(view, { onDispatch, onRestart });

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="pyramid-stock"]')!.click());
    expect(onDispatch).toHaveBeenCalledWith('stock.draw', undefined);
    expect(container.querySelector('[data-testid="pyramid-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="pyramid-daily"]')).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="pyramid-restart"]')!.click(),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh pyramid only outside the daily mode', () => {
    const { view } = table(31, 'relaxed');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="pyramid-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="pyramid-daily"]')).toBeNull();
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="pyramid-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint!.reason);
    expect(textSurface().hint).toContain(view.hint!.reason);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });
});
