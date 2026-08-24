import { act, createElement } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableScreen, type TableView } from './TableScreen';

const VIEW: TableView = {
  players: [
    {
      seat: 0,
      name: 'Owner',
      avatarId: 'ember',
      hand: ['H1', 'S2'],
      lives: 3,
      isLocal: true,
    },
  ],
  activeSeat: 0,
  stockCount: 40,
  discard: ['D3'],
  phaseLabel: 'discard a card',
  legal: {
    drawStock: false,
    drawDiscard: false,
    discardCards: ['H1'],
    knock: false,
  },
};

describe('TableScreen owner hand', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  it('reveals the hand and opponent backs only when each dealt card lands', () => {
    vi.useFakeTimers();
    const view: TableView = {
      ...VIEW,
      players: [
        VIEW.players[0]!,
        {
          seat: 1,
          name: 'Juniper',
          avatarId: 'juniper',
          hand: [],
          handCount: 1,
          lives: 3,
          isBot: true,
        },
      ],
    };
    const fx = [
      { kind: Fx.DealCard, payload: { card: 'H1', from: 'stock', to: 'hand:0' }, at: 0 },
      { kind: Fx.DealCard, payload: { card: 'C5', from: 'stock', to: 'hand:1' }, at: 70 },
      { kind: Fx.DealCard, payload: { card: 'S2', from: 'stock', to: 'hand:0' }, at: 140 },
      {
        kind: Fx.FlipCard,
        payload: { card: 'D3', from: 'stock', to: 'discard' },
        at: 210,
      },
    ];

    act(() => root.render(createElement(TableScreen, { view, fx, fxKey: 'deal' })));

    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="0 hidden cards"]')).not.toBeNull();
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'dealing',
    );
    expect(container.querySelector('[data-zone="stock"]')?.getAttribute('aria-label')).toContain(
      '44 cards remain',
    );
    expect(
      container
        .querySelector('[data-zone="stock"] [data-stack-depth]')
        ?.getAttribute('data-stack-depth'),
    ).toBe('5');
    expect(
      container.querySelector('[data-zone="discard"] [aria-label="3 of diamonds"]'),
    ).toBeNull();

    act(() => vi.advanceTimersByTime(220));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(1);
    expect(container.querySelector('[data-zone="stock"]')?.getAttribute('aria-label')).toContain(
      '43 cards remain',
    );

    act(() => vi.advanceTimersByTime(70));
    expect(container.querySelector('[aria-label="1 hidden cards"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(70));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(70));
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'complete',
    );
    expect(
      container.querySelector('[data-zone="discard"] [aria-label="3 of diamonds"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-zone="stock"]')?.getAttribute('aria-label')).toContain(
      '40 cards remain',
    );
  });

  it('discards a legal card directly on click without a separate discard control', () => {
    const onDiscard = vi.fn();

    act(() => {
      root.render(createElement(TableScreen, { view: VIEW, fx: [], fxKey: 0, onDiscard }));
    });

    const legalCard = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Discard A of hearts"]',
    );
    const illegalCard = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Discard 2 of spades"]',
    );

    expect(legalCard?.disabled).toBe(false);
    expect(illegalCard?.disabled).toBe(true);
    expect(legalCard?.closest('[data-playable]')?.getAttribute('data-playable')).toBe('true');
    expect(illegalCard?.closest('[data-playable]')?.getAttribute('data-playable')).toBe('false');
    expect(container.querySelector('[data-local-turn="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Your turn');
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === 'Discard',
      ),
    ).toBe(false);

    act(() => legalCard?.click());

    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledWith('H1');
  });

  it('removes the center-pile turn glow while another seat is acting', () => {
    act(() => {
      root.render(createElement(TableScreen, { view: VIEW, fx: [], fxKey: 0, busy: true }));
    });

    expect(container.querySelector('[data-local-turn="false"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Your turn');
  });

  it('hides an eliminated opponent fan', () => {
    const view: TableView = {
      ...VIEW,
      players: [
        VIEW.players[0]!,
        {
          seat: 1,
          name: 'Juniper',
          avatarId: 'juniper',
          hand: [],
          handCount: 3,
          lives: 0,
          isBot: true,
          eliminated: true,
        },
      ],
    };

    act(() => {
      root.render(createElement(TableScreen, { view, fx: [], fxKey: 0 }));
    });

    const seat = container.querySelector('[data-seat="1"]');
    expect(seat?.className).toMatch(/seatEliminated/);
    expect(seat?.querySelector('[aria-label="3 hidden cards"]')).toBeNull();
    expect(seat?.querySelector('[aria-label="0 hidden cards"]')).not.toBeNull();
  });

  it('shows the local player life chips beside their hand', () => {
    act(() => {
      root.render(createElement(TableScreen, { view: VIEW, fx: [], fxKey: 0 }));
    });

    const ownerLives = container.querySelector('[aria-label="My lives: 3"]');
    expect(ownerLives).not.toBeNull();
    expect(ownerLives?.querySelectorAll('i')).toHaveLength(3);
  });

  it('shows the newest discard on top when the pile contains more than three cards', () => {
    const view = { ...VIEW, discard: ['C13', 'H12', 'D11', 'S10'] };

    act(() => {
      root.render(createElement(TableScreen, { view, fx: [], fxKey: 0 }));
    });

    const discard = container.querySelector('[data-zone="discard"]');
    const visibleCards = Array.from(discard?.querySelectorAll('[aria-label]') ?? []).map((card) =>
      card.getAttribute('aria-label'),
    );

    expect(visibleCards).toEqual(['J of diamonds', 'Q of hearts', 'K of clubs']);
  });

  it('uses a full-size card chassis throughout a draw flight', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });

    act(() => {
      root.render(
        createElement(TableScreen, {
          view: VIEW,
          fx: [{ kind: Fx.DrawCard, payload: { card: 'C4', seat: 0, from: 'discard' }, at: 0 }],
          fxKey: 1,
        }),
      );
    });

    const flightCard = container.querySelector<HTMLElement>(
      '[data-flight-card] > [aria-label="4 of clubs"]',
    );
    expect(flightCard).not.toBeNull();
    expect(flightCard?.className).not.toMatch(/cardCompact/);
  });
});
