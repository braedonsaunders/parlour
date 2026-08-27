import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesForTripeaksMode } from '@/lib/tripeaks/modes';
import { tripeaksTableView, type TripeaksTableView } from '@/lib/tripeaks/view';
import { TripeaksTransport } from '@/lib/solo/TripeaksTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { moveTableFocusTo, pressTableKey } from '@/components/table/shell/keyboard-test-utils';
import { TripeaksTableScreen } from './TripeaksTableScreen';

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'relaxed' = 'daily') {
  const transport = new TripeaksTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForTripeaksMode(mode),
  });
  return {
    transport,
    view: tripeaksTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: TripeaksTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(TripeaksTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
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

describe('TripeaksTableScreen', () => {
  it('renders the public peaks and omits stock identities from text', () => {
    const { view } = table();
    render(view);
    expect(container.querySelectorAll('[data-testid^="tripeaks-card-"]')).toHaveLength(18);
    expect(container.querySelector('[data-testid="tripeaks-undo"]')?.textContent).toBe(
      'Undo · 0 moves',
    );
    const serialised = JSON.stringify(textSurface());
    expect(serialised).not.toContain('seed');
    expect(serialised).not.toContain('??');
    expect(textSurface()).toMatchObject({
      game: 'tripeaks',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      leftover: 18,
    });
  });

  it('dispatches stock flips and keeps the daily table on the same deal', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    const onRestart = vi.fn();
    render(view, { onDispatch, onRestart });

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="tripeaks-stock"]')!.click(),
    );
    expect(onDispatch).toHaveBeenCalledWith('stock.flip', undefined);
    expect(container.querySelector('[data-testid="tripeaks-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="tripeaks-daily"]')).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="tripeaks-restart"]')!.click(),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh deal only outside the daily mode', () => {
    const { view } = table(31, 'relaxed');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="tripeaks-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="tripeaks-daily"]')).toBeNull();
  });

  it('plays a glowing free card with arrows and Enter', () => {
    let chosen: { view: TripeaksTableView; from: number; card: string } | undefined;
    for (let seed = 1; seed <= 80 && !chosen; seed++) {
      const { view } = table(seed);
      const move = view.legal.find((legal) => legal.id === 'tableau.play');
      const from = (move?.payload as { from?: number } | undefined)?.from;
      if (from === undefined) continue;
      const card = view.tableau[from];
      if (card) chosen = { view, from, card };
    }
    expect(chosen).toBeDefined();
    const onDispatch = vi.fn();
    render(chosen!.view, { onDispatch });
    const cardEl = container.querySelector<HTMLElement>(
      `[data-testid="tripeaks-card-${chosen!.from}"][data-playable="true"]`,
    );
    expect(cardEl).not.toBeNull();
    const stock = container.querySelector<HTMLButtonElement>('[data-testid="tripeaks-stock"]')!;
    const button = cardEl!.querySelector<HTMLButtonElement>('button')!;
    act(() => stock.focus());
    moveTableFocusTo(button);
    pressTableKey(button, 'Enter');
    expect(onDispatch).toHaveBeenCalledWith('tableau.play', { from: chosen!.from });
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="tripeaks-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint!.reason);
    expect(textSurface().hint).toContain(view.hint!.reason);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });

  it('keeps every peak slot present in the DOM', () => {
    const { view } = table();
    render(view);
    expect(container.querySelector('[data-testid="tripeaks-board"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="tripeaks-card-"]')).toHaveLength(18);
  });
});
