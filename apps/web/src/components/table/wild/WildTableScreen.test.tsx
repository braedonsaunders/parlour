import { act, createElement } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WildTableView } from '@/lib/wild/view';
import { WildTableScreen } from './WildTableScreen';

const VIEW: WildTableView = {
  players: [
    {
      seat: 0,
      name: 'Owner',
      avatarId: 'ember',
      handCount: 2,
      isLocal: true,
      isBot: false,
    },
  ],
  localSeat: 0,
  activeSeat: 0,
  stockCount: 80,
  discard: ['red-5-0'],
  activeColor: 'red',
  direction: 1,
  pendingDraw: 0,
  phaseLabel: 'party pile · one deal',
  hand: ['red-7-0', 'blue-2-0'],
  decision: 'play',
  legal: {
    playCards: ['red-7-0'],
    draw: true,
    declineJump: false,
    chooseColor: false,
  },
};

describe('WildTableScreen turn affordances', () => {
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

  it('builds the local fan progressively and flips the starter only after the deal', () => {
    vi.useFakeTimers();
    const fx = [
      {
        kind: Fx.DealCard,
        payload: { card: 'red-7-0', from: 'stock', to: 'hand:0' },
        at: 0,
      },
      {
        kind: Fx.DealCard,
        payload: { card: 'blue-2-0', from: 'stock', to: 'hand:0' },
        at: 70,
      },
      {
        kind: Fx.FlipCard,
        payload: { card: 'red-5-0', from: 'stock', to: 'discard' },
        at: 140,
      },
    ];

    act(() => root.render(createElement(WildTableScreen, { view: VIEW, fx, fxKey: 'deal' })));

    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(0);
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'dealing',
    );
    expect(container.querySelector('[data-zone="stock"]')?.getAttribute('aria-label')).toContain(
      '83 cards remain',
    );
    expect(container.querySelector('[data-zone="discard"] [aria-label="red 5"]')).toBeNull();

    act(() => vi.advanceTimersByTime(180));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(70));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(70));
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'complete',
    );
    expect(container.querySelector('[data-zone="discard"] [aria-label="red 5"]')).not.toBeNull();
    expect(container.querySelector('[data-zone="stock"]')?.getAttribute('aria-label')).toContain(
      '80 cards remain',
    );
  });

  it('lifts legal cards, dims invalid cards, and marks the center piles on the local turn', () => {
    act(() => {
      root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0 }));
    });

    const legal = container.querySelector<HTMLButtonElement>('button[aria-label="Play red 7"]');
    const invalid = container.querySelector<HTMLButtonElement>('button[aria-label="Play blue 2"]');

    expect(legal?.disabled).toBe(false);
    expect(invalid?.disabled).toBe(true);
    expect(legal?.closest('[data-playable]')?.getAttribute('data-playable')).toBe('true');
    expect(invalid?.closest('[data-playable]')?.getAttribute('data-playable')).toBe('false');
    expect(container.querySelector('[data-local-turn="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Your turn');
  });

  it('opens the shared table settings and confirms before quitting', () => {
    const onQuit = vi.fn();
    act(() => {
      root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0, onQuit }));
    });

    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Table menu"]')?.click(),
    );

    expect(container.querySelector('[role="dialog"][aria-label="Table menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="background-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="music-section"]')).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="quit-to-menu"]')?.click());
    expect(onQuit).not.toHaveBeenCalled();
    expect(
      container.querySelector('[role="dialog"][aria-label="Quit this match?"]'),
    ).not.toBeNull();

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="confirm-quit"]')?.click());
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('keeps Wild cards full size during center-to-hand flights', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });

    act(() => {
      root.render(
        createElement(WildTableScreen, {
          view: VIEW,
          fx: [
            { kind: Fx.DrawCard, payload: { card: 'green-4-0', seat: 0, from: 'stock' }, at: 0 },
          ],
          fxKey: 1,
        }),
      );
    });

    const flightCard = container.querySelector<HTMLElement>(
      '[data-flight-card] > [aria-label="green 4"]',
    );
    expect(flightCard).not.toBeNull();
    expect(flightCard?.className).not.toMatch(/cardCompact/);
  });
});
