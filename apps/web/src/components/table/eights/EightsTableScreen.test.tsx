import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EightsTableView } from '@/lib/eights/view';
import { EightsTableScreen, tablePosition } from './EightsTableScreen';

const BASE: EightsTableView = {
  players: [
    {
      seat: 0,
      name: 'Owner',
      avatarId: 'ember',
      handCount: 3,
      isLocal: true,
      isBot: false,
      score: 40,
      roundsWon: 1,
      dealer: true,
    },
    {
      seat: 1,
      name: 'Juniper',
      avatarId: 'juniper',
      handCount: 5,
      isLocal: false,
      isBot: true,
      score: 12,
      roundsWon: 0,
      dealer: false,
    },
  ],
  localSeat: 0,
  activeSeat: 0,
  roundNumber: 2,
  targetScore: 100,
  stockCount: 30,
  discard: ['D5'],
  activeSuit: 'D',
  direction: 1,
  pendingDraw: 0,
  phaseLabel: 'house · round 2',
  hand: ['D9', 'H8', 'S12'],
  drawnCard: null,
  decision: 'play',
  legal: { playCards: ['D9', 'H8'], draw: true, pass: false, chooseSuit: false, ready: false },
  roundEnd: null,
  matchOver: false,
};

function view(overrides: Partial<EightsTableView> = {}): EightsTableView {
  return { ...BASE, ...overrides };
}

describe('EightsTableScreen', () => {
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

  const render = (props: Record<string, unknown>) =>
    act(() => root.render(createElement(EightsTableScreen, props as never)));

  it('states the suit the pile is asking for rather than leaving it to the top card', () => {
    render({ view: view({ activeSuit: 'C' }), fx: [], fxKey: 0 });
    const chip = container.querySelector('[data-testid="active-suit"]')!;
    expect(chip.textContent).toContain('♣');
    expect(chip.textContent).toContain('clubs');
  });

  it('carries the local score in the HUD, since the local seat plate is hidden', () => {
    render({ view: view(), fx: [], fxKey: 0 });
    const score = container.querySelector('[data-testid="eights-score"]')!;
    expect(score.textContent).toContain('40');
    expect(score.textContent).toContain('100');
  });

  it('shows the pickup riding on an unanswered two', () => {
    render({ view: view({ pendingDraw: 4 }), fx: [], fxKey: 0 });
    expect(container.textContent).toContain('+4');
  });

  it('only lets the seat tap the cards the pile will actually take', () => {
    render({ view: view(), fx: [], fxKey: 0 });
    const cards = [...container.querySelectorAll<HTMLElement>('[data-hand-card]')];
    expect(cards).toHaveLength(3);
    const byId = new Map(cards.map((card) => [card.dataset.cardId, card]));
    expect(byId.get('D9')!.querySelector('button')!.disabled).toBe(false);
    expect(byId.get('H8')!.querySelector('button')!.disabled).toBe(false);
    // A queen of spades on a diamond five is neither the suit nor the rank.
    expect(byId.get('S12')!.querySelector('button')!.disabled).toBe(true);
  });

  it('parks the table on the suit call after an eight', () => {
    const onChooseSuit = vi.fn();
    render({
      view: view({ decision: 'choose-suit', legal: { ...BASE.legal, chooseSuit: true } }),
      fx: [],
      fxKey: 0,
      onChooseSuit,
    });

    const chooser = container.querySelector('[data-testid="suit-chooser"]')!;
    expect(chooser).not.toBeNull();
    const buttons = [...chooser.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.dataset.suit)).toEqual(['S', 'H', 'D', 'C']);

    act(() => buttons[1]!.click());
    expect(onChooseSuit).toHaveBeenCalledWith('H');
  });

  it('prices every hand out on the scoresheet between deals', () => {
    const onReady = vi.fn();
    render({
      view: view({
        decision: 'round-end',
        legal: { ...BASE.legal, playCards: [], draw: false, ready: true },
        roundEnd: {
          reason: 'shed',
          winner: 1,
          winnerName: 'Juniper',
          points: 62,
          handValues: [62, 0],
          handCounts: [3, 0],
          waitingFor: [0],
        },
      }),
      fx: [],
      fxKey: 0,
      onReady,
    });

    const sheet = container.querySelector('[data-testid="round-end-sheet"]')!;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.textContent).toContain('Juniper went out');
    expect(sheet.textContent).toContain('+62');
    expect(sheet.textContent).toContain('62 pts held');

    const next = container.querySelector<HTMLButtonElement>('[data-testid="eights-next-round"]')!;
    expect(next.disabled).toBe(false);
    act(() => next.click());
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('names a blocked round for what it was, and holds the sheet once ready is sent', () => {
    render({
      view: view({
        decision: null,
        legal: { ...BASE.legal, playCards: [], draw: false },
        roundEnd: {
          reason: 'blocked',
          winner: 0,
          winnerName: 'Owner',
          points: 8,
          handValues: [4, 12],
          handCounts: [1, 2],
          waitingFor: [1],
        },
      }),
      fx: [],
      fxKey: 0,
    });

    const sheet = container.querySelector('[data-testid="round-end-sheet"]')!;
    expect(sheet.textContent).toContain('Table blocked');
    expect(sheet.textContent).toContain('Waiting for 1');
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="eights-next-round"]')!.disabled,
    ).toBe(true);
  });

  it('offers a way out of a turn with nothing to play and nothing to draw', () => {
    const onPass = vi.fn();
    render({
      view: view({ legal: { ...BASE.legal, playCards: [], draw: false, pass: true } }),
      fx: [],
      fxKey: 0,
      onPass,
    });
    const pass = container.querySelector<HTMLButtonElement>('[data-testid="eights-pass"]')!;
    expect(pass.textContent).toBe('Nothing to play');
    act(() => pass.click());
    expect(onPass).toHaveBeenCalledTimes(1);
  });
});

describe('tablePosition', () => {
  it('keeps the viewer at the bottom and rings the rest around them', () => {
    expect(tablePosition(0, 0, 4)).toBe(0);
    expect(tablePosition(2, 2, 4)).toBe(0);
    // Head-to-head the opponent sits opposite, not off to one side.
    expect(tablePosition(1, 0, 2)).toBe(2);
    // Every ring uses distinct plates, so nobody is drawn on top of anybody.
    for (const seats of [2, 3, 4, 5, 6]) {
      const positions = Array.from({ length: seats }, (_, seat) => tablePosition(seat, 0, seats));
      expect(new Set(positions).size, `${seats} seats`).toBe(seats);
      expect(positions[0]).toBe(0);
    }
  });
});
