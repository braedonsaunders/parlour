import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CribbageTableView } from '@/lib/cribbage/view';
import { CribbageTableScreen } from './CribbageTableScreen';

const VIEW: CribbageTableView = {
  players: [
    {
      seat: 0,
      name: 'You',
      avatarId: 'cobalt',
      personaId: 'self',
      isLocal: true,
      isBot: false,
      handCount: 6,
      score: 42,
      gamesWon: 0,
    },
    {
      seat: 1,
      name: 'Otto',
      avatarId: 'ember',
      personaId: 'otto',
      isLocal: false,
      isBot: true,
      handCount: 6,
      score: 37,
      gamesWon: 0,
    },
  ],
  localSeat: 0,
  activeSeat: 0,
  dealer: 0,
  phase: 'discard',
  phaseLabel: 'crib discards',
  dealNo: 2,
  targetGames: 1,
  stockCount: 40,
  cribCount: 0,
  starter: null,
  runningCount: 0,
  pile: [],
  hand: ['S1', 'H5', 'D7', 'C9', 'S11', 'H13'],
  legal: {
    discardPairs: [
      ['S1', 'H5'],
      ['S1', 'D7'],
      ['H5', 'D7'],
    ],
    playCards: [],
    cut: false,
    claim: false,
    steal: false,
  },
};

describe('CribbageTableScreen', () => {
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
    container.remove();
  });

  it('renders the signature board, skunk line, scores and local hand rail', () => {
    act(() => root.render(createElement(CribbageTableScreen, { view: VIEW, fx: [], fxKey: 0 })));
    expect(container.textContent).toContain('90 · skunk');
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('37');
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(6);
    expect(container.querySelectorAll('svg circle').length).toBeGreaterThan(240);
  });

  it('selects exactly two cards and commits an engine-owned discard pair', () => {
    const onDiscard = vi.fn();
    act(() =>
      root.render(createElement(CribbageTableScreen, { view: VIEW, fx: [], fxKey: 0, onDiscard })),
    );
    const cards = container.querySelectorAll<HTMLButtonElement>('[data-hand-card] button');
    act(() => cards[0]?.click());
    act(() => cards[1]?.click());
    const commit = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Slide to your crib'),
    );
    expect(commit?.disabled).toBe(false);
    act(() => commit?.click());
    expect(onDiscard).toHaveBeenCalledWith(['S1', 'H5']);
  });

  it('only enables legal pegging cards', () => {
    const onPlay = vi.fn();
    const pegView: CribbageTableView = {
      ...VIEW,
      phase: 'peg',
      runningCount: 24,
      hand: ['S1', 'H5', 'D7'],
      players: VIEW.players.map((player) =>
        player.seat === 0 ? { ...player, handCount: 3 } : player,
      ),
      legal: { ...VIEW.legal, discardPairs: [], playCards: ['S1', 'H5'] },
    };
    act(() =>
      root.render(createElement(CribbageTableScreen, { view: pegView, fx: [], fxKey: 1, onPlay })),
    );
    const cards = container.querySelectorAll<HTMLButtonElement>('[data-hand-card] button');
    expect([...cards].map((card) => card.disabled)).toEqual([false, false, true]);
    act(() => cards[1]?.click());
    expect(onPlay).toHaveBeenCalledWith('H5');
  });
});
