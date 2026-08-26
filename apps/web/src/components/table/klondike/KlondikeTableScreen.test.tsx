import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '@parlour/engine';
import { klondikeGame } from '@parlour/game-klondike';
import { rulesForKlondikeMode } from '@/lib/klondike/modes';
import {
  cardOfMove,
  klondikeTableView,
  selectionForCard,
  sourceOfMove,
  targetOfMove,
  type KlondikeTableView,
} from '@/lib/klondike/view';
import { KlondikeTransport } from '@/lib/solo/KlondikeTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { KlondikeTableScreen } from './KlondikeTableScreen';

const KLONDIKE_STYLES = readFileSync(join(process.cwd(), 'src/styles/klondike.module.css'), 'utf8');

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

  it('highlights the stock and waste zones for draw and recycle hints', () => {
    const { view } = table();
    render({
      ...view,
      hint: { move: { id: 'stock.draw' }, reason: 'Turn the stock.' },
    });
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="klondike-hint"]')!.click());
    expect(container.querySelector('[data-zone="stock"]')!.getAttribute('data-hint')).toBe('true');

    render({
      ...view,
      stockCount: 0,
      waste: ['S13'],
      hint: { move: { id: 'stock.recycle' }, reason: 'Recycle the waste.' },
    });
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="klondike-hint"]')!.click());
    expect(container.querySelector('[data-zone="stock"]')!.getAttribute('data-hint')).toBe('true');
    expect(container.querySelector('[data-zone="waste"]')!.getAttribute('data-hint')).toBe('true');
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
    expect(KLONDIKE_STYLES).toMatch(
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
      container.querySelector<HTMLButtonElement>('[data-testid="klondike-undo"]')!.disabled,
    ).toBe(true);
  });

  it('keeps the empty-column King marker decorative so taps reach the target button', () => {
    const { view } = table();
    render({
      ...view,
      waste: ['S13'],
      tableau: view.tableau.map((column, index) => (index === 0 ? { down: [], up: [] } : column)),
      legal: [...view.legal, { id: 'waste.toTableau', payload: { to: 0 } }],
    });
    const empty = container.querySelector<HTMLElement>(
      '[data-zone="tableau:0"] span[aria-hidden="true"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.className).toContain('emptyColumn');
    expect(KLONDIKE_STYLES).toMatch(/\.emptyColumn\s*\{[^}]*pointer-events:\s*none;/s);
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

  it('keeps the playable board and permanent win status in portrait-ready DOM', () => {
    const { view } = table();
    render({ ...view, stage: 'won', canFinish: false }, { elapsedMs: 92_000 });
    expect(container.querySelector('[data-testid="klondike-rotate-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="klondike-board"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="klondike-win"]')!.textContent).toContain(
      'Table cleared',
    );
    expect(container.textContent).toContain('01:32');
    expect(textSurface()).toMatchObject({ status: 'won', won: true });
  });

  describe('showing where a held card can go', () => {
    it('marks the board as holding only while a card is selected', () => {
      const { view } = table();
      render(view);
      const board = () => container.querySelector('[data-testid="klondike-board"]')!;
      expect(board().hasAttribute('data-holding')).toBe(false);

      const run = container.querySelector<HTMLElement>('[data-testid="klondike-run-head"]');
      act(() => run!.click());
      expect(board().hasAttribute('data-holding')).toBe(true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(board().hasAttribute('data-holding')).toBe(false);
    });

    it('dims every card that is not a legal destination while holding', () => {
      // The rule keys off `[data-holding]` on the board and `[data-legal-target]`
      // on each pile, so a stylesheet regression that drops either one is a
      // silent loss of the whole affordance.
      expect(KLONDIKE_STYLES).toContain('.board[data-holding]');
      expect(KLONDIKE_STYLES).toContain('var(--unplayable-filter)');
      expect(KLONDIKE_STYLES).toContain('var(--unplayable-opacity)');
      expect(KLONDIKE_STYLES).toContain(':not([data-legal-target])');
      // The card being held and the run under it must be exempt, or the player
      // dims the very thing they picked up.
      expect(KLONDIKE_STYLES).toContain(':not([data-holds-selection])');
      expect(KLONDIKE_STYLES).toContain(':not([data-in-selected-run])');
    });

    it('reaches the card chassis by a hook that survives CSS module hashing', () => {
      // `:global(.card)` matched nothing: PlayingCard's class is a CSS module
      // class and is hashed at build time. Three rules were dead because of it,
      // including the selection ring on a card taken from the waste.
      expect(KLONDIKE_STYLES).not.toContain(':global(.card)');
      expect(KLONDIKE_STYLES).toContain('[data-card-chassis]');
      const { view } = table();
      render(view);
      expect(container.querySelector('[data-card-chassis]')).not.toBeNull();
    });

    it('highlights a card selected from the waste, not just tableau runs', () => {
      // Draw from the real stock until the waste top is a card the rules will
      // actually let us pick up; a synthetic waste would not be selectable and
      // would prove nothing about the highlight.
      const { transport } = table();
      let view = klondikeTableView(transport.getSnapshot(), transport.legalMoves());
      for (let draw = 0; draw < 24; draw += 1) {
        const top = view.waste.at(-1);
        if (top && selectionForCard(view, 'waste', top)) break;
        const stock = view.legal.find((move) => move.id === 'stock.draw');
        if (!stock) break;
        transport.dispatch(stock.id, stock.payload);
        view = klondikeTableView(transport.getSnapshot(), transport.legalMoves());
      }
      const top = view.waste.at(-1)!;
      expect(selectionForCard(view, 'waste', top)).not.toBeNull();

      render(view);
      const wasteZone = () => container.querySelector<HTMLElement>('[data-zone="waste"]')!;
      expect(wasteZone().querySelector(`[data-card="${top}"]`)!.hasAttribute('data-selected')).toBe(
        false,
      );

      act(() =>
        wasteZone().querySelector<HTMLElement>(`[data-card="${top}"] [data-card-chassis]`)!.click(),
      );
      expect(wasteZone().querySelector(`[data-card="${top}"]`)!.hasAttribute('data-selected')).toBe(
        true,
      );
      expect(wasteZone().hasAttribute('data-holds-selection')).toBe(true);
      expect(
        container.querySelector('[data-testid="klondike-board"]')!.hasAttribute('data-holding'),
      ).toBe(true);
    });

    it('calls out the card the stock just turned up, and clears it on the next move', () => {
      const { view } = table();
      render({ ...view, waste: [], moves: 4 });
      const wasteCard = () =>
        container.querySelector<HTMLElement>('[data-zone="waste"] [data-card]');
      expect(wasteCard()).toBeNull();

      render({ ...view, waste: ['H7'], moves: 5 });
      expect(wasteCard()!.hasAttribute('data-just-drawn')).toBe(true);

      // Any later move retires the call-out: "fresh" lasts exactly one move.
      render({ ...view, waste: ['H7'], moves: 6 });
      expect(wasteCard()!.hasAttribute('data-just-drawn')).toBe(false);
    });

    it('keeps the fresh-draw ring visually distinct from the selection ring', () => {
      // Selection is teal and shipped separately; a freshly turned waste card
      // is amber. If these ever collapse to one colour, "this just arrived" and
      // "you are holding this" become the same signal.
      const selectionRule =
        /\[data-selected='true'\][^{]*\{[^}]*outline:\s*3px solid (#[0-9a-f]{6})/i;
      const selectionTeal = selectionRule.exec(KLONDIKE_STYLES)?.[1]?.toLowerCase();
      expect(selectionTeal, 'the selection outline colour').toBeTruthy();

      const fresh = /--kl-fresh:\s*([^;]+);/.exec(KLONDIKE_STYLES)?.[1]?.trim().toLowerCase();
      expect(fresh, 'the fresh-draw token').toBeTruthy();
      expect(fresh).not.toBe(selectionTeal);

      // The call-out is scoped to the board and stands down for a card the
      // player has actually picked up, so the two never fight over one card.
      expect(KLONDIKE_STYLES).toContain(
        ".board [data-just-drawn]:not([data-selected='true']) > [data-card-chassis]",
      );
    });
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
