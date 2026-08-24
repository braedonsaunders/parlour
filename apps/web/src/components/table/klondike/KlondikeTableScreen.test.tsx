import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@parlour/engine';
import { klondikeGame } from '@parlour/game-klondike';
import { rulesForKlondikeMode } from '@/lib/klondike/modes';
import {
  cardOfMove,
  klondikeTableView,
  sourceOfMove,
  targetOfMove,
  type KlondikeTableView,
} from '@/lib/klondike/view';
import { KlondikeTransport } from '@/lib/solo/KlondikeTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { KlondikeTableScreen } from './KlondikeTableScreen';

let container: HTMLDivElement;
let root: Root;

function table(seed = 31, mode: 'daily' | 'classic' | 'relaxed' = 'daily') {
  const transport = new KlondikeTransport({
    mode,
    dailyKey: mode === 'daily' ? '2026-08-24' : null,
    seed,
    rules: rulesForKlondikeMode(mode),
  });
  return {
    transport,
    view: klondikeTableView(transport.getSnapshot(), transport.legalMoves()),
  };
}

function render(view: KlondikeTableView, props: Record<string, unknown> = {}) {
  act(() =>
    root.render(createElement(KlondikeTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
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

describe('KlondikeTableScreen', () => {
  it('renders every hidden card as an anonymous back and omits identities from text', () => {
    const seed = 31;
    const { view } = table(seed);
    const live = createSession(klondikeGame, {
      seed,
      config: rulesForKlondikeMode('daily'),
      seats: 1,
    }).state;
    const hiddenIds = [...live.stock, ...live.tableau.flatMap((column) => column.down)];

    render(view);

    const hidden = [...container.querySelectorAll<HTMLElement>('[data-face-down]')];
    expect(hidden).toHaveLength(21);
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
      game: 'klondike',
      status: 'ready',
      mode: 'daily',
      dailyKey: '2026-08-24',
      moves: 0,
      recycles: 0,
    });
  });

  it('dispatches stock actions and keeps the daily table on the same deal', () => {
    const { view } = table();
    const onDispatch = vi.fn();
    const onRestart = vi.fn();
    render(view, { onDispatch, onRestart });

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-stock"]')!.click(),
    );
    expect(onDispatch).toHaveBeenCalledWith('stock.draw', undefined);
    expect(container.querySelector('[data-testid="klondike-new-deal"]')).toBeNull();
    expect(container.querySelector('[data-testid="klondike-daily"]')).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-restart"]')!.click(),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh deal only outside the daily mode', () => {
    const { view } = table(31, 'relaxed');
    const onNewDeal = vi.fn();
    render(view, { onNewDeal });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="klondike-new-deal"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    expect(onNewDeal).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="klondike-daily"]')).toBeNull();
  });

  it('shows a public hint and clears it with Escape', () => {
    const { view } = table();
    render(view);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="klondike-hint"]')!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain(view.hint!.reason);
    expect(textSurface().hint).toContain(view.hint!.reason);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(textSurface().hint).toBeNull();
  });

  it('selects a public card then dispatches its ordinary legal destination', () => {
    let chosen:
      | {
          view: KlondikeTableView;
          move: KlondikeTableView['legal'][number];
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
      `[data-testid="klondike-run-head"][data-card="${chosen!.card}"]`,
    );
    expect(runButton).not.toBeNull();
    expect(runButton!.tagName).toBe('BUTTON');
    expect(runButton!.getAttribute('aria-label')).toContain('tableau column');
    act(() => runButton!.click());
    expect(runButton!.getAttribute('aria-pressed')).toBe('true');
    const target = container.querySelector<HTMLElement>(`[data-zone="${chosen!.target}"]`)!;
    expect(target.getAttribute('data-legal-target')).toBe('true');
    act(() => target.querySelector<HTMLButtonElement>('button')!.click());
    expect(onDispatch).toHaveBeenCalledWith(chosen!.move.id, chosen!.move.payload);
  });

  it('collapses the real opening layout and all flights for profile calm motion', () => {
    vi.useFakeTimers();
    useProfileStore.setState((state) => ({
      ...state,
      settings: { ...state.settings, reducedMotion: true },
    }));
    const { transport, view } = table();
    const fx = transport.getSnapshot().session.setupFx ?? [];
    act(() => root.render(createElement(KlondikeTableScreen, { view, fx, fxKey: 'opening' })));

    expect(container.querySelector('main')!.getAttribute('data-deal-state')).toBe('complete');
    expect(container.querySelectorAll('[data-face-down]')).toHaveLength(21);
    const cues = [...container.querySelectorAll<HTMLElement>('[data-fx-cue]')];
    expect(cues).toHaveLength(28);
    for (const cue of cues) {
      expect(cue.style.visibility).toBe('hidden');
      expect(cue.style.opacity).toBe('0');
    }
    act(() => void vi.advanceTimersByTime(6_000));
    for (const cue of cues) {
      expect(cue.style.visibility).toBe('hidden');
      expect(cue.style.opacity).toBe('0');
      expect(cue.style.transform).toBe('');
    }
  });

  it('uses the same immediate calm snapshot for OS motion preferences', () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const { transport, view } = table();
    const fx = transport.getSnapshot().session.setupFx ?? [];
    act(() => root.render(createElement(KlondikeTableScreen, { view, fx, fxKey: 'os-opening' })));

    expect(container.querySelector('main')!.getAttribute('data-deal-state')).toBe('complete');
    for (const cue of container.querySelectorAll<HTMLElement>('[data-fx-cue]')) {
      expect(cue.style.visibility).toBe('hidden');
      expect(cue.style.opacity).toBe('0');
    }
    act(() => void vi.advanceTimersByTime(6_000));
    for (const cue of container.querySelectorAll<HTMLElement>('[data-fx-cue]')) {
      expect(cue.style.visibility).toBe('hidden');
      expect(cue.style.opacity).toBe('0');
      expect(cue.style.transform).toBe('');
    }
  });

  it('keeps a portrait rotate affordance and permanent win/move status in the DOM', () => {
    const { view } = table();
    render({ ...view, stage: 'won', canFinish: false }, { elapsedMs: 92_000 });
    expect(
      container.querySelector('[data-testid="klondike-rotate-notice"]')!.textContent,
    ).toContain('Turn the table sideways');
    expect(container.querySelector('[data-testid="klondike-win"]')!.textContent).toContain(
      'Table cleared',
    );
    expect(container.textContent).toContain('01:32');
    expect(textSurface()).toMatchObject({ status: 'won', won: true });
  });
});

function collectCardIds(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^[SHDC](?:[1-9]|1[0-3])$/.test(value)) found.add(value);
  if (Array.isArray(value)) value.forEach((entry) => collectCardIds(entry, found));
  if (typeof value === 'object' && value !== null) {
    Object.values(value as Record<string, unknown>).forEach((entry) =>
      collectCardIds(entry, found),
    );
  }
  return found;
}
