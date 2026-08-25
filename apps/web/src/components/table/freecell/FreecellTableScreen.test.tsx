import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rulesForFreecellMode } from '@/lib/freecell/modes';
import {
  cardOfMove,
  freecellTableView,
  sourceOfMove,
  targetOfMove,
  type FreecellTableView,
} from '@/lib/freecell/view';
import { FreecellTransport } from '@/lib/solo/FreecellTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { FreecellTableScreen } from './FreecellTableScreen';

const FREECELL_STYLES = readFileSync(join(process.cwd(), 'src/styles/freecell.module.css'), 'utf8');

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'relaxed' = 'daily') {
  const transport = new FreecellTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForFreecellMode(mode),
  });
  return {
    transport,
    view: freecellTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: FreecellTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(FreecellTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
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

describe('FreecellTableScreen', () => {
  it('renders eight open columns and the free-cell row', () => {
    const { view } = table();
    render(view);
    expect(container.querySelectorAll('[data-zone^="tableau:"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-testid^="freecell-cell-"]')).toHaveLength(4);
    expect(container.querySelector('[aria-label="FreeCell table"]')).not.toBeNull();
    expect(container.querySelector('[data-face-down]')).toBeNull();
    expect(textSurface()).toMatchObject({
      game: 'freecell',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      moves: 0,
    });
  });

  it('keeps the daily table on the same deal', () => {
    const { view } = table();
    const onRestart = vi.fn();
    render(view, { onRestart });
    expect(container.querySelector('[data-testid="freecell-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="freecell-daily"]')).not.toBeNull();
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="freecell-restart"]')!.click(),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh deal only outside the daily mode', () => {
    const { view } = table(31, 'relaxed');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    expect(view.cells).toHaveLength(6);
    const button = container.querySelector<HTMLButtonElement>('[data-testid="freecell-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="freecell-daily"]')).toBeNull();
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    if (!view.hint) return;
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="freecell-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint.reason);
    expect(textSurface().hint).toContain(view.hint.reason);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });

  it('selects a public card then dispatches its ordinary legal destination', () => {
    let chosen:
      | {
          view: FreecellTableView;
          move: FreecellTableView['legal'][number];
          card: string;
          target: string;
        }
      | undefined;
    for (let seed = 1; seed <= 100 && !chosen; seed++) {
      const { view } = table(seed);
      const move = view.legal.find((legal) => legal.id === 'tableau.move');
      if (!move) continue;
      const card = cardOfMove(move, view);
      const target = targetOfMove(move, view);
      if (card && target && sourceOfMove(move, view)) chosen = { view, move, card, target };
    }
    expect(chosen).toBeDefined();
    const onDispatch = vi.fn();
    render(chosen!.view, { onDispatch });

    const runButton = container.querySelector<HTMLButtonElement>(
      `[data-testid="freecell-run-head"][data-card="${chosen!.card}"]`,
    );
    expect(runButton).not.toBeNull();
    act(() => runButton!.click());
    expect(runButton!.getAttribute('aria-pressed')).toBe('true');
    expect(FREECELL_STYLES).toMatch(
      /\.tableauCard\[data-selected='true'\]\s*>\s*button\s*\{[^}]*outline:\s*3px solid #66ffe1;[^}]*box-shadow:[^}]*rgba\(65, 255, 219, 0\.72\)/s,
    );
    const target = container.querySelector<HTMLElement>(`[data-zone="${chosen!.target}"]`)!;
    expect(target.getAttribute('data-legal-target')).toBe('true');
    act(() => target.querySelector<HTMLButtonElement>('button')!.click());
    expect(onDispatch).toHaveBeenCalledWith(chosen!.move.id, chosen!.move.payload);
  });

  it('does not let Undo race the safe-finish loop', () => {
    const { view } = table();
    render({ ...view, canUndo: true }, { busy: true });
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="freecell-undo"]')!.disabled,
    ).toBe(true);
  });

  it('keeps the empty-column marker decorative so taps reach the target button', () => {
    const { view } = table();
    render({
      ...view,
      tableau: view.tableau.map((column, index) => (index === 0 ? [] : column)),
      legal: [...view.legal, { id: 'tableau.move', payload: { from: 1, card: 'S5', to: 0 } }],
    });
    const empty = container.querySelector<HTMLElement>(
      '[data-zone="tableau:0"] span[aria-hidden="true"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.className).toContain('emptyColumn');
    expect(FREECELL_STYLES).toMatch(/\.emptyColumn\s*\{[^}]*pointer-events:\s*none;/s);
  });

  it('dims every card that is not a legal destination while holding', () => {
    expect(FREECELL_STYLES).toContain('.board[data-holding]');
    expect(FREECELL_STYLES).toContain('var(--unplayable-filter)');
    expect(FREECELL_STYLES).toContain('var(--unplayable-opacity)');
    expect(FREECELL_STYLES).toContain(':not([data-legal-target])');
    expect(FREECELL_STYLES).toContain(':not([data-holds-selection])');
    expect(FREECELL_STYLES).toContain(':not([data-in-selected-run])');
    expect(FREECELL_STYLES).not.toContain(':global(.card)');
    expect(FREECELL_STYLES).toContain('[data-card-chassis]');
  });

  it('keeps a portrait rotate affordance and permanent win/move status in the DOM', () => {
    const { view } = table();
    render({ ...view, stage: 'won', canFinish: false }, { elapsedMs: 92_000 });
    expect(
      container.querySelector('[data-testid="freecell-rotate-notice"]')!.textContent,
    ).toContain('Turn the table sideways');
    expect(container.querySelector('[data-testid="freecell-win"]')!.textContent).toContain(
      'Table cleared',
    );
    expect(container.textContent).toContain('01:32');
    expect(textSurface()).toMatchObject({ status: 'won', won: true });
  });
});
