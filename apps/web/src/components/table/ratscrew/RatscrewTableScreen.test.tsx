import { Fx } from '@parlour/engine';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatscrewTableView } from '@/lib/ratscrew/view';
import { RatscrewTableScreen } from './RatscrewTableScreen';

function viewFor(localSeat: number): RatscrewTableView {
  return {
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      name: seat === localSeat ? 'You' : `Bot ${seat}`,
      avatarId: seat === localSeat ? 'ember' : 'slate',
      stackCount: 13,
      isLocal: seat === localSeat,
      isBot: seat !== localSeat,
    })),
    localSeat,
    turnSeat: localSeat,
    center: [],
    centerCount: 0,
    window: null,
    challenge: null,
    phaseLabel: '0 cards on the pile',
    mode: 'classic',
    status: 'playing',
    winnerSeat: null,
    decision: 'flip',
    legal: { flip: true, slap: true },
  };
}

describe('RatscrewTableScreen', () => {
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

  it('rotates authority seats so a non-zero local stack stays at the bottom position', () => {
    act(() =>
      root.render(createElement(RatscrewTableScreen, { view: viewFor(2), fx: [], fxKey: 0 })),
    );

    expect(container.querySelector('[data-seat="2"]')?.getAttribute('data-table-position')).toBe(
      '0',
    );
    expect(container.querySelector('[data-seat="3"]')?.getAttribute('data-table-position')).toBe(
      '1',
    );
    expect(container.querySelector('[data-seat="0"]')?.getAttribute('data-table-position')).toBe(
      '2',
    );
    expect(container.querySelector('[data-seat="1"]')?.getAttribute('data-table-position')).toBe(
      '3',
    );
  });

  it('labels the private stack as face-down and gives the empty center pile a clear target', () => {
    act(() =>
      root.render(createElement(RatscrewTableScreen, { view: viewFor(0), fx: [], fxKey: 0 })),
    );

    expect(container.querySelector('[data-zone="hand:0"]')?.getAttribute('aria-label')).toBe(
      'Your face-down stack, 13 cards. Faces stay hidden until flipped.',
    );
    expect(container.querySelector('[data-zone="discard"]')?.textContent).toContain('Flip here');
    expect(container.textContent).toContain('Your stack · 13');
  });

  it('renders the live slap pattern as an alert over the center pile', () => {
    const view: RatscrewTableView = {
      ...viewFor(0),
      turnSeat: null,
      center: ['H7', 'S7'],
      centerCount: 2,
      window: { pattern: 'double', elapsedMs: 0, durationMs: 800 },
      decision: 'slap',
      legal: { flip: false, slap: true },
    };

    act(() => root.render(createElement(RatscrewTableScreen, { view, fx: [], fxKey: 0 })));

    expect(container.querySelector('[data-zone="discard"]')).not.toBeNull();
    const alert = container.querySelector('[role="alertdialog"]');
    expect(alert?.getAttribute('aria-label')).toBe('Slap window open');
    expect(alert?.textContent).toContain('Double!');
  });

  it('keeps every setup flight face-down and gates actions until the deal lands', () => {
    vi.useFakeTimers();
    const fx = [
      {
        kind: Fx.DealCard,
        payload: { card: 'S13', from: 'stock', to: 'hand:2', dur: 140 },
        at: 0,
      },
      {
        kind: Fx.DealCard,
        payload: { card: 'D2', from: 'stock', to: 'hand:1', dur: 140 },
        at: 1224,
      },
    ];
    act(() =>
      root.render(createElement(RatscrewTableScreen, { view: viewFor(2), fx, fxKey: 'deal' })),
    );

    expect(container.querySelectorAll('[data-fx-cue] [aria-label="Face-down card"]')).toHaveLength(
      2,
    );
    expect(container.querySelector('[data-fx-cue] [aria-label="K of spades"]')).toBeNull();
    const dealingButtons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    expect(dealingButtons.find((button) => button.textContent === 'Flip')?.disabled).toBe(true);
    expect(dealingButtons.find((button) => button.textContent === 'SLAP!')?.disabled).toBe(true);
    const before = JSON.parse(
      (window as unknown as { render_game_to_text: () => string }).render_game_to_text(),
    );
    expect(before).toMatchObject({ dealing: true, canFlip: false, canSlap: false });
    expect(container.querySelector('[data-zone="hand:2"]')?.getAttribute('aria-label')).toContain(
      '12 cards',
    );
    expect(container.querySelector('[data-zone="hand:1"]')?.getAttribute('aria-label')).toContain(
      '12 cards',
    );

    act(() => vi.advanceTimersByTime(140));
    expect(container.querySelector('[data-zone="hand:2"]')?.getAttribute('aria-label')).toContain(
      '13 cards',
    );
    expect(container.querySelector('[data-zone="hand:1"]')?.getAttribute('aria-label')).toContain(
      '12 cards',
    );

    act(() => vi.advanceTimersByTime(1223));
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === 'Flip',
      )?.disabled,
    ).toBe(true);

    act(() => vi.advanceTimersByTime(1));

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.btn-fat')];
    expect(buttons.find((button) => button.textContent === 'Flip')?.disabled).toBe(false);
    expect(buttons.find((button) => button.textContent === 'SLAP!')?.disabled).toBe(false);
  });

  it('reveals an explicit flip flight on its way to the center pile', () => {
    const fx = [
      {
        kind: Fx.FlipCard,
        payload: { card: 'H5', seat: 2, to: 'center' },
        at: 0,
      },
    ];
    act(() =>
      root.render(createElement(RatscrewTableScreen, { view: viewFor(2), fx, fxKey: 'flip' })),
    );

    expect(container.querySelector('[data-fx-cue] [aria-label="5 of hearts"]')).not.toBeNull();
    expect(container.querySelector('[data-fx-cue] [aria-label="Face-down card"]')).toBeNull();
  });
});
