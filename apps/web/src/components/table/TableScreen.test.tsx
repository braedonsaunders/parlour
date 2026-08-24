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
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
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
