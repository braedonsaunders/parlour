import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fx } from '@parlour/engine';
import { PyramidFx } from '@parlour/game-pyramid';
import { rulesForPyramidMode } from '@/lib/pyramid/modes';
import { pyramidTableView, type PyramidTableView } from '@/lib/pyramid/view';
import { PyramidTransport } from '@/lib/solo/PyramidTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import {
  activateTableControl,
  moveTableFocusTo,
  pressTableKey,
} from '@/components/table/shell/keyboard-test-utils';
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
    expect(container.querySelector('[data-testid="pyramid-undo"]')?.textContent).toBe(
      'Undo · 0 moves',
    );
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

  it('lights the stock when the opening tableau has no pair', () => {
    let view: PyramidTableView | undefined;
    for (let seed = 1; seed <= 200 && !view; seed++) {
      const next = table(seed, 'classic').view;
      const live = next.legal.some(
        (move) => move.id === 'pyramid.pair' || move.id === 'pyramid.remove',
      );
      if (!live && next.legal.some((move) => move.id === 'stock.draw')) view = next;
    }
    expect(view).toBeDefined();
    render(view!);
    expect(
      container.querySelector('[data-testid="pyramid-stock"]')?.getAttribute('data-playable'),
    ).toBe('true');
  });

  it('keeps the waste face live and plays a matching pyramid card in one tap', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    render(
      {
        ...view,
        waste: ['C3'],
        legal: [{ id: 'pyramid.pair', payload: { a: { row: 6, col: 0 }, b: 'waste' } }],
      },
      { onDispatch },
    );
    expect(
      container.querySelector('[data-testid="pyramid-waste"] [data-card-chassis]')?.className,
    ).not.toMatch(/Disabled|disabled/);
    act(() =>
      container
        .querySelector<HTMLElement>('[data-testid="pyramid-card-6-0"]')
        ?.querySelector('button')
        ?.click(),
    );
    expect(onDispatch).toHaveBeenCalledWith('pyramid.pair', { a: { row: 6, col: 0 }, b: 'waste' });
  });

  it('lets clicks pass through every emptied row onto the full exposed card', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/pyramid.module.css'), 'utf8');
    expect(css).toMatch(/\.row\s*\{[^}]*pointer-events:\s*none;/s);
    expect(css).toMatch(/\.pyramidCard\s*\{[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(/\.emptySlot\s*\{[^}]*pointer-events:\s*none;/s);
    expect(css).toMatch(/\.board\s*\{[^}]*overflow:\s*visible;/s);
  });

  it('animates a waste King with the same card flight used for tableau removals', () => {
    const { view } = table();
    render(
      { ...view, waste: ['C5'] },
      {
        fx: [
          { kind: PyramidFx.Remove, payload: { card: 'D13', from: 'waste', to: 'waste' } },
          {
            kind: Fx.DealCard,
            payload: { card: 'D13', from: 'waste', to: 'waste', faceDown: false, dur: 200 },
          },
        ],
        fxKey: 'waste-king',
      },
    );
    expect(container.querySelectorAll('[data-card-flight]')).toHaveLength(1);
    expect(
      container.querySelector('[data-card-flight] [aria-label="K of diamonds"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-just-drawn]')).toBeNull();
  });

  it('keeps the bottom row free so the opening cards can be tapped', () => {
    const { view } = table();
    render(view);
    const bottoms = container.querySelectorAll('[data-testid^="pyramid-card-6-"]');
    expect(bottoms).toHaveLength(7);
    for (const slot of bottoms) {
      expect(slot.hasAttribute('data-free')).toBe(true);
      expect(slot.querySelector('button')?.disabled).toBe(false);
    }
  });

  it('pairs two free cards with arrows and Enter', () => {
    let chosen:
      | { view: PyramidTableView; a: { row: number; col: number }; b: { row: number; col: number } }
      | undefined;
    for (let seed = 1; seed <= 80 && !chosen; seed++) {
      const { view } = table(seed);
      const move = view.legal.find((legal) => {
        if (legal.id !== 'pyramid.pair') return false;
        const payload = legal.payload as { a?: unknown; b?: unknown };
        return (
          typeof payload.a === 'object' &&
          payload.a !== null &&
          typeof payload.b === 'object' &&
          payload.b !== null
        );
      });
      const payload = move?.payload as
        { a?: { row: number; col: number }; b?: { row: number; col: number } } | undefined;
      if (payload?.a && payload.b) chosen = { view, a: payload.a, b: payload.b };
    }
    expect(chosen).toBeDefined();
    const onDispatch = vi.fn();
    render(chosen!.view, { onDispatch });
    const first = container.querySelector<HTMLButtonElement>(
      `[data-testid="pyramid-card-${chosen!.a.row}-${chosen!.a.col}"] button`,
    );
    const second = container.querySelector<HTMLButtonElement>(
      `[data-testid="pyramid-card-${chosen!.b.row}-${chosen!.b.col}"] button`,
    );
    activateTableControl(first!);
    moveTableFocusTo(second!);
    pressTableKey(second!, 'Enter');
    expect(onDispatch).toHaveBeenCalledWith('pyramid.pair', { a: chosen!.a, b: chosen!.b });
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
