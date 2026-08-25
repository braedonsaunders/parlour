import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playOptionsFor, scopaTableView } from '@/lib/scopa/view';
import { ScopaTransport } from '@/lib/solo/ScopaTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { ScopaTableScreen } from './ScopaTableScreen';

const SCOPA_STYLES = readFileSync(join(process.cwd(), 'src/styles/scopa.module.css'), 'utf8');

let container: HTMLDivElement;
let root: Root;

/**
 * A table with seat 0 to act.
 *
 * The dealer rotates, so at some seeds and seat counts the human is not first.
 * Running the bots forward is what a player would see anyway, and it keeps the
 * tests about the table rather than about which seed happened to open.
 */
function table(seats = 2) {
  const transport = new ScopaTransport({
    mode: 'classic',
    seats,
    seed: 20260824,
    player: { name: 'You', avatarId: 'ember' },
    botTier: 2,
  });
  for (let step = 0; step < 200; step += 1) {
    const live = transport.getSnapshot().session;
    if (live.status !== 'playing' || live.state.turn === 0) break;
    transport.playBotTurn();
  }
  return transport;
}

function viewOf(transport: ScopaTransport) {
  return scopaTableView(transport.getSnapshot(), transport.legalMoves(0));
}

function render(transport: ScopaTransport, props: Record<string, unknown> = {}) {
  const legal = transport.legalMoves(0);
  act(() =>
    root.render(
      createElement(ScopaTableScreen, {
        view: scopaTableView(transport.getSnapshot(), legal),
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

describe('ScopaTableScreen', () => {
  it('shows a loading table before the deal', () => {
    act(() => root.render(createElement(ScopaTableScreen, { view: null, fx: [], fxKey: 'x' })));
    expect(container.textContent).toContain('Turning four cards onto the felt');
  });

  it('draws the four opening table cards and a hand of three', () => {
    const transport = table();
    const view = viewOf(transport);
    render(transport);
    expect(view.table.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-testid^="scopa-table-"]').length).toBe(
      view.table.length,
    );
    expect(container.querySelectorAll('[data-hand-card]').length).toBe(view.hand.length);
  });

  it('offers a capture choice only once a card is picked up', () => {
    const transport = table();
    render(transport);
    expect(container.querySelector('[role="group"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-hand-card] button')!.click());
    expect(container.querySelector('[role="group"]')).not.toBeNull();
  });

  it('surfaces every legal way to play the held card, and no others', () => {
    // This is the rule the table exists for. A single-card match is FORCED, so
    // the pack offers exactly one move and the table must not invent a pose
    // beside it; when nothing matches, the pose is the only option.
    const transport = table();
    const legal = transport.legalMoves(0);
    const view = scopaTableView(transport.getSnapshot(), legal);
    const card = view.hand.find((entry) => view.playable.includes(entry.card))!;
    const options = playOptionsFor(legal, card.card, view.table.length);

    render(transport);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-hand-card] button')];
    const index = view.hand.findIndex((entry) => entry.card === card.card);
    act(() => buttons[index]!.click());

    const offered = container.querySelectorAll(
      '[data-testid^="scopa-take-"], [data-testid="scopa-pose"]',
    );
    expect(offered.length).toBe(options.length);
    expect(options.length).toBeGreaterThan(0);
    // Every offered button corresponds to a move the engine produced.
    for (const option of options) {
      const id = option.pose ? 'scopa-pose' : `scopa-take-${option.take.join('+')}`;
      expect(container.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
    }
  });

  it('plays the move the engine produced, not one the table invented', () => {
    const transport = table();
    const played: { id: string }[] = [];
    render(transport, { onPlay: (move: { id: string }) => played.push(move) });
    act(() => container.querySelector<HTMLButtonElement>('[data-hand-card] button')!.click());
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid^="scopa-take-"], [data-testid="scopa-pose"]',
        )!
        .click(),
    );
    expect(played).toHaveLength(1);
    expect(played[0]!.id).toBe('playCard');
  });

  it('marks the seven of coins, which is a point of its own', () => {
    expect(SCOPA_STYLES).toContain('[data-settebello]');
  });

  it('lets the hand receive clicks through the shared rail', () => {
    // The shared rail sets `pointer-events: none` on itself and re-enables it
    // only for `.card`, a hashed module class this game's face is not — so
    // without this the whole hand is dead and the board swallows every tap.
    const handCard = /\.handCard \{([^}]*)\}/.exec(SCOPA_STYLES)?.[1] ?? '';
    expect(handCard).toContain('pointer-events: auto');
  });

  it('lays the board out as a grid inside the playfield', () => {
    const board = /\.board \{([^}]*)\}/.exec(SCOPA_STYLES)?.[1] ?? '';
    expect(board).toContain('display: grid');
    expect(board).toContain('grid-template-rows');
    const transport = table();
    render(transport);
    const playfield = container.querySelector('section[aria-label="Scopa table"]')!;
    expect(playfield.querySelector('[data-testid="scopa-board"]')).not.toBeNull();
    expect(playfield.querySelector('[data-zone^="hand:"]')).not.toBeNull();
  });

  it('positions the seat and declares the tokens the shared nameplate paints from', () => {
    const seat = /\.seat \{([^}]*)\}/.exec(SCOPA_STYLES)?.[1] ?? '';
    expect(seat).toContain('position: relative');
    expect(seat).toContain('--seat-accent');
    expect(seat).toContain('--seat-shade');
  });

  it('seats every supported table size', () => {
    for (const seats of [2, 3, 4, 6]) {
      const transport = table(seats);
      render(transport);
      // Opponents get a plate each; the local seat sits under the felt.
      expect(container.querySelectorAll('[data-testid^="scopa-seat-"]').length).toBe(seats);
    }
  });
});
