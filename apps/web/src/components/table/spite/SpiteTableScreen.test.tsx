import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spiteTableView, targetsFor } from '@/lib/spite/view';
import { SpiteTransport } from '@/lib/solo/SpiteTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { SpiteTableScreen } from './SpiteTableScreen';

const SPITE_STYLES = readFileSync(join(process.cwd(), 'src/styles/spite.module.css'), 'utf8');

let container: HTMLDivElement;
let root: Root;

function table(seats = 2) {
  return new SpiteTransport({
    mode: 'quick',
    seats,
    seed: 20260824,
    player: { name: 'You', avatarId: 'ember' },
    botTier: 2,
  });
}

function render(transport: SpiteTransport, props: Record<string, unknown> = {}) {
  const legal = transport.legalMoves(0);
  act(() =>
    root.render(
      createElement(SpiteTableScreen, {
        view: spiteTableView(transport.getSnapshot(), legal),
        legal,
        fx: [],
        fxKey: 'ready',
        ...props,
      }),
    ),
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  useProfileStore.setState((state) => ({ ...state, settings: { ...DEFAULT_PROFILE_SETTINGS } }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SpiteTableScreen', () => {
  it('shows a loading table before the deal', () => {
    act(() => root.render(createElement(SpiteTableScreen, { view: null, fx: [], fxKey: 'x' })));
    expect(container.textContent).toContain('Stacking the payoff piles');
  });

  it('draws a payoff pile per seat and the shared centre builds', () => {
    for (const seats of [2, 3, 4]) {
      const transport = table(seats);
      render(transport);
      expect(container.querySelectorAll('[data-testid^="spite-payoff-"]').length).toBe(seats);
      expect(container.querySelectorAll('[data-testid^="spite-centre-"]').length).toBe(4);
    }
  });

  it('lights only the destinations the rules allow for the held card', () => {
    const transport = table();
    const legal = transport.legalMoves(0);
    const view = spiteTableView(transport.getSnapshot(), legal);
    const card = view.hand.find((entry) => view.liftable.includes(entry.card))!;
    const expected = targetsFor(legal, card.card);

    render(transport);
    expect(container.querySelectorAll('[data-legal-target]')).toHaveLength(0);

    const index = view.hand.findIndex((entry) => entry.card === card.card);
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>('[data-hand-card] button')][index]!.click(),
    );

    expect(container.querySelectorAll('[data-legal-target]').length).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('plays the move the engine produced when a destination is chosen', () => {
    const transport = table();
    const played: { id: string }[] = [];
    render(transport, { onPlay: (move: { id: string }) => played.push(move) });
    act(() => container.querySelector<HTMLButtonElement>('[data-hand-card] button')!.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-legal-target]')!.click());
    expect(played).toHaveLength(1);
    expect(['build', 'discard']).toContain(played[0]!.id);
  });

  it('drops a held card the rules have withdrawn instead of keeping it', () => {
    // A Spite turn is many plays long and each rewrites the legal set. The
    // selection is derived from that set rather than cleared in an effect, so
    // a stale card cannot offer a destination that no longer exists.
    const transport = table();
    render(transport);
    act(() => container.querySelector<HTMLButtonElement>('[data-hand-card] button')!.click());
    expect(container.querySelectorAll('[data-legal-target]').length).toBeGreaterThan(0);
    // Re-render with no legal moves at all: the held card must let go.
    act(() =>
      root.render(
        createElement(SpiteTableScreen, {
          view: spiteTableView(transport.getSnapshot(), []),
          legal: [],
          fx: [],
          fxKey: 'ready',
        }),
      ),
    );
    expect(container.querySelectorAll('[data-legal-target]')).toHaveLength(0);
  });

  it('lets the hand receive clicks through the shared rail', () => {
    // The shared rail sets `pointer-events: none` on itself and re-enables it
    // only for `.card`, a hashed module class this game's face is not.
    const handCard = /\.handCard \{([^}]*)\}/.exec(SPITE_STYLES)?.[1] ?? '';
    expect(handCard).toContain('pointer-events: auto');
  });

  it('lays the board out as a grid inside the playfield', () => {
    const board = /\.board \{([^}]*)\}/.exec(SPITE_STYLES)?.[1] ?? '';
    expect(board).toContain('display: grid');
    expect(board).toContain('grid-template-rows');
    const transport = table();
    render(transport);
    const playfield = container.querySelector('section[aria-label="Spite and Malice table"]')!;
    expect(playfield.querySelector('[data-testid="spite-board"]')).not.toBeNull();
    // The rail must live inside the felt, or the board overlays and eats taps.
    expect(playfield.querySelector('[data-zone^="hand:"]')).not.toBeNull();
  });

  it('positions the seat and declares the tokens the shared nameplate paints from', () => {
    const seat = /\.seat \{([^}]*)\}/.exec(SPITE_STYLES)?.[1] ?? '';
    expect(seat).toContain('position: relative');
    expect(seat).toContain('--seat-accent');
    expect(seat).toContain('--seat-shade');
  });

  it('dims what the held card cannot reach, using the shared tokens', () => {
    expect(SPITE_STYLES).toContain('.board[data-holding]');
    expect(SPITE_STYLES).toContain('var(--unplayable-filter)');
    expect(SPITE_STYLES).toContain('var(--unplayable-opacity)');
  });
});
