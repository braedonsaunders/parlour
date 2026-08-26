import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesForGolfMode } from '@/lib/golf/modes';
import { golfTableView, type GolfTableView } from '@/lib/golf/view';
import { GolfTransport } from '@/lib/solo/GolfTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { GolfTableScreen } from './GolfTableScreen';

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'fairway' = 'daily') {
  const transport = new GolfTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForGolfMode(mode),
  });
  return {
    transport,
    view: golfTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: GolfTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(GolfTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
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

describe('GolfTableScreen', () => {
  it('renders the public tableau and omits stock identities from text', () => {
    const { view } = table();
    render(view);
    expect(container.querySelectorAll('[data-testid^="golf-column-"]')).toHaveLength(7);
    const serialised = JSON.stringify(textSurface());
    expect(serialised).not.toContain('seed');
    expect(serialised).not.toContain('??');
    expect(textSurface()).toMatchObject({
      game: 'golf',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      leftover: 35,
    });
  });

  it('dispatches stock turns and keeps the daily table on the same hole', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    const onRestart = vi.fn();
    render(view, { onDispatch, onRestart });

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="golf-stock"]')!.click());
    expect(onDispatch).toHaveBeenCalledWith('stock.draw', undefined);
    expect(container.querySelector('[data-testid="golf-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="golf-daily"]')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="golf-restart"]')!.click());
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh hole only outside the daily mode', () => {
    const { view } = table(31, 'fairway');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="golf-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="golf-daily"]')).toBeNull();
  });

  it('plays a glowing column foot in one tap', () => {
    let chosen: { view: GolfTableView; from: number; card: string } | undefined;
    for (let seed = 1; seed <= 80 && !chosen; seed++) {
      const { view } = table(seed);
      const move = view.legal.find((legal) => legal.id === 'tableau.play');
      const from = (move?.payload as { from?: number } | undefined)?.from;
      if (from === undefined) continue;
      const card = view.tableau[from]?.at(-1);
      if (card) chosen = { view, from, card };
    }
    expect(chosen).toBeDefined();
    const onDispatch = vi.fn();
    render(chosen!.view, { onDispatch });
    const foot = container.querySelector<HTMLElement>(
      `[data-testid="golf-column-${chosen!.from}"] [data-playable="true"]`,
    );
    expect(foot).not.toBeNull();
    expect(foot!.getAttribute('data-card')).toBe(chosen!.card);
    act(() => foot!.querySelector<HTMLButtonElement>('button')!.click());
    expect(onDispatch).toHaveBeenCalledWith('tableau.play', { from: chosen!.from });
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="golf-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint!.reason);
    expect(textSurface().hint).toContain(view.hint!.reason);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });

  it('keeps all seven columns playable in portrait-ready DOM', () => {
    const { view } = table();
    render(view);
    expect(container.querySelector('[data-testid="golf-rotate-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="golf-board"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="golf-column-"]')).toHaveLength(7);
  });
});
