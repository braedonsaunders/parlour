import { act, createElement } from 'react';
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
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === 'Discard',
      ),
    ).toBe(false);

    act(() => legalCard?.click());

    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledWith('H1');
  });
});
