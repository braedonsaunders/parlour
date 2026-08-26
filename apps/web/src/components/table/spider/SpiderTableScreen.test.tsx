import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@parlour/engine';
import { spiderGame } from '@parlour/game-spider';
import { rulesForSpiderMode } from '@/lib/spider/modes';
import {
  cardOfMove,
  sourceOfMove,
  spiderTableView,
  targetOfMove,
  type SpiderTableView,
} from '@/lib/spider/view';
import { SpiderTransport } from '@/lib/solo/SpiderTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { SpiderTableScreen } from './SpiderTableScreen';

const SPIDER_STYLES = readFileSync(join(process.cwd(), 'src/styles/spider.module.css'), 'utf8');

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'relaxed' | 'hard' = 'daily') {
  const transport = new SpiderTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForSpiderMode(mode),
  });
  return {
    transport,
    view: spiderTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: SpiderTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(SpiderTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
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

describe('SpiderTableScreen', () => {
  it('renders every hidden card as an anonymous back and omits identities from text', () => {
    const seed = 31;
    const { view } = table(seed);
    const live = createSession(spiderGame, {
      seed,
      config: rulesForSpiderMode('daily'),
      seats: 1,
    }).state;
    const hiddenIds = [...live.stock, ...live.tableau.flatMap((column) => column.down)];

    render(view);

    const hidden = [...container.querySelectorAll<HTMLElement>('[data-face-down]')];
    expect(hidden).toHaveLength(44);
    for (const node of hidden) {
      expect(node.hasAttribute('data-card')).toBe(false);
      expect(node.querySelector('[data-card]')).toBeNull();
      expect(node.getAttribute('aria-label')).toBe('Face-down card');
    }
    const serialised = JSON.stringify(textSurface());
    expect(serialised).not.toContain('seed');
    expect(serialised).not.toContain('??');
    const publicIds = collectCardIds(textSurface());
    for (const card of hiddenIds) expect(publicIds.has(card)).toBe(false);
    expect(textSurface()).toMatchObject({
      game: 'spider',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      moves: 0,
    });
  });

  it('dispatches stock deals and keeps the daily table on the same deal', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    const onRestart = vi.fn();
    render(view, { onDispatch, onRestart });

    const stock = container.querySelector<HTMLButtonElement>('[data-testid="spider-stock"]')!;
    if (!stock.disabled) {
      act(() => stock.click());
      expect(onDispatch).toHaveBeenCalledWith('stock.deal', undefined);
    }
    expect(container.querySelector('[data-testid="spider-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="spider-daily"]')).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="spider-restart"]')!.click(),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh deal only outside the daily mode', () => {
    const { view } = table(31, 'relaxed');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="spider-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="spider-daily"]')).toBeNull();
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="spider-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint!.reason);
    expect(textSurface().hint).toContain(view.hint!.reason);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });

  it('selects a public run then dispatches its ordinary legal destination', () => {
    let chosen:
      | {
          view: SpiderTableView;
          move: SpiderTableView['legal'][number];
          card: string;
          target: string;
        }
      | undefined;
    for (let seed = 1; seed <= 80 && !chosen; seed++) {
      const { view } = table(seed);
      const move = view.legal.find((legal) => legal.id === 'tableau.move');
      if (!move) continue;
      const card = cardOfMove(move, view);
      const target = targetOfMove(move);
      if (card && target && sourceOfMove(move)) chosen = { view, move, card, target };
    }
    expect(chosen).toBeDefined();
    const onDispatch = vi.fn();
    render(chosen!.view, { onDispatch });

    const runButton = container.querySelector<HTMLButtonElement>(
      `[data-testid="spider-run-head"][data-card="${chosen!.card}"]`,
    );
    expect(runButton).not.toBeNull();
    act(() => runButton!.click());
    expect(runButton!.getAttribute('aria-pressed')).toBe('true');
    expect(SPIDER_STYLES).toMatch(
      /\.tableauCard\[data-selected='true'\]\s*>\s*button\s*\{[^}]*outline:\s*3px solid #66ffe1;/s,
    );
    const target = container.querySelector<HTMLElement>(`[data-zone="${chosen!.target}"]`)!;
    expect(target.getAttribute('data-legal-target')).toBe('true');
    act(() => target.querySelector<HTMLButtonElement>('button')!.click());
    expect(onDispatch).toHaveBeenCalledWith(chosen!.move.id, chosen!.move.payload);
  });

  it('keeps the empty-column marker decorative so taps reach the target button', () => {
    const { view } = table();
    render({
      ...view,
      tableau: view.tableau.map((column, index) => (index === 0 ? { down: [], up: [] } : column)),
      legal: [...view.legal, { id: 'tableau.move', payload: { from: 1, card: 'S5', to: 0 } }],
    });
    const empty = container.querySelector<HTMLElement>(
      '[data-zone="tableau:0"] span[aria-hidden="true"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.className).toContain('emptyColumn');
    expect(SPIDER_STYLES).toMatch(/\.emptyColumn\s*\{[^}]*pointer-events:\s*none;/s);
  });

  it('keeps the playable board and permanent win status in portrait-ready DOM', () => {
    const { view } = table();
    render({ ...view, stage: 'won', canFinish: false }, { elapsedMs: 92_000 });
    expect(container.querySelector('[data-testid="spider-rotate-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="spider-board"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="spider-win"]')!.textContent).toContain(
      'Table cleared',
    );
    expect(container.textContent).toContain('01:32');
    expect(textSurface()).toMatchObject({ status: 'won', won: true });
  });

  it('dims every card that is not a legal destination while holding', () => {
    expect(SPIDER_STYLES).toContain('.board[data-holding]');
    expect(SPIDER_STYLES).toContain('var(--unplayable-filter)');
    expect(SPIDER_STYLES).toContain('var(--unplayable-opacity)');
    expect(SPIDER_STYLES).toContain(':not([data-legal-target])');
    expect(SPIDER_STYLES).toContain(':not([data-holds-selection])');
    expect(SPIDER_STYLES).toContain(':not([data-in-selected-run])');
    expect(SPIDER_STYLES).not.toContain(':global(.card)');
    expect(SPIDER_STYLES).toContain('[data-card-chassis]');
  });
});

function collectCardIds(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^[SHDC](?:[1-9]|1[0-3])[a-h]?$/.test(value)) found.add(value);
  if (Array.isArray(value)) value.forEach((entry) => collectCardIds(entry, found));
  if (typeof value === 'object' && value !== null) {
    Object.values(value as Record<string, unknown>).forEach((entry) =>
      collectCardIds(entry, found),
    );
  }
  return found;
}
