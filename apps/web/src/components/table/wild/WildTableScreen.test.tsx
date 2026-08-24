import { act, createElement } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
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
