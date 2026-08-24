import { act, createElement } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EuchreTableView } from '@/lib/euchre/view';
import styles from '@/styles/euchre.module.css';
import tableStyles from '@/styles/table.module.css';
import { EuchreTableScreen } from './EuchreTableScreen';

const HANDS = [
  ['H9', 'H10', 'H11', 'H12', 'H13'],
  ['D9', 'D10', 'D11', 'D12', 'D13'],
  ['C9', 'C10', 'C11', 'C12', 'C13'],
  ['S9', 'S10', 'S11', 'S12', 'S13'],
] as const;

const VIEW: EuchreTableView = {
  players: [
    {
      seat: 0,
      name: 'You',
      avatarId: 'ember',
      isLocal: true,
      isBot: false,
      team: 0,
      handCount: 5,
      isDealer: true,
      isSittingOut: false,
    },
    {
      seat: 1,
      name: 'Marge',
      avatarId: 'plum',
      isLocal: false,
      isBot: true,
      team: 1,
      handCount: 5,
      isDealer: false,
      isSittingOut: false,
    },
    {
      seat: 2,
      name: 'Vinny',
      avatarId: 'ember',
      isLocal: false,
      isBot: true,
      team: 0,
      handCount: 5,
      isDealer: false,
      isSittingOut: false,
    },
    {
      seat: 3,
      name: 'Dot',
      avatarId: 'marigold',
      isLocal: false,
      isBot: true,
      team: 1,
      handCount: 5,
      isDealer: false,
      isSittingOut: false,
    },
  ],
  localSeat: 0,
  activeSeat: 0,
  stageLabel: 'classic pub · order it up',
  scores: [0, 0],
  targetScore: 10,
  teams: [
    { team: 0, score: 0, isMaker: false, tricks: 0, label: 'North–South' },
    { team: 1, score: 0, isMaker: false, tricks: 0, label: 'East–West' },
  ],
  handNo: 1,
  dealer: 0,
  turn: 0,
  biddingRound: 1,
  upcard: 'S1',
  turnedDown: null,
  trump: null,
  caller: null,
  alone: false,
  sittingOut: null,
  trick: [],
  leader: null,
  tricksPlayed: 0,
  lastTrickWinner: null,
  hand: HANDS[0],
  legalCards: [],
  callSuits: [],
  canPass: true,
  decision: 'order-up',
  matchOver: false,
  mode: 'classic',
  rules: { targetScore: 10, stickDealer: true, goingAlone: true },
};

function setupFx(): FxEvent[] {
  const events: FxEvent[] = [];
  let cursor = 0;
  for (let cardIndex = 0; cardIndex < 5; cardIndex += 1) {
    for (let seat = 0; seat < 4; seat += 1) {
      events.push({
        kind: Fx.DealCard,
        payload: {
          card: HANDS[seat]![cardIndex]!,
          from: 'stock',
          to: `hand:${seat}`,
          dur: 220,
        },
        at: cursor * 65,
      });
      cursor += 1;
    }
  }
  events.push({
    kind: Fx.FlipCard,
    payload: { card: VIEW.upcard, from: 'stock', to: 'discard', dur: 220 },
    at: cursor * 65,
  });
  return events;
}

describe('EuchreTableScreen', () => {
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

  it('keeps the compact score rail with the left HUD and sizes every bid action alike', () => {
    act(() => root.render(createElement(EuchreTableScreen, { view: VIEW, fx: [], fxKey: 0 })));

    const scoreRail = container.querySelector('[data-team-scores]');
    expect(scoreRail?.closest(`.${styles.hudCluster}`)).not.toBeNull();
    expect(scoreRail?.textContent).toContain('First to 10');
    expect(scoreRail?.textContent).toContain('N/S · 0 tricks');
    expect(scoreRail?.textContent).toContain('E/W · 0 tricks');

    const actions = ['Order it up', 'Go alone?', 'Pass'].map((label) =>
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      ),
    );
    expect(actions.every((button) => button?.classList.contains(styles.bidAction!))).toBe(true);
  });

  it('reveals local and opponent hands only as their setup flights land', () => {
    vi.useFakeTimers();
    act(() =>
      root.render(
        createElement(EuchreTableScreen, {
          view: VIEW,
          fx: setupFx(),
          fxKey: 'opening-deal',
        }),
      ),
    );

    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-seat="1"] [aria-label="Face-down card"]'),
    ).toHaveLength(0);
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'dealing',
    );

    act(() => vi.advanceTimersByTime(221));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-seat="1"] [aria-label="Face-down card"]'),
    ).toHaveLength(0);

    act(() => vi.advanceTimersByTime(65));
    expect(
      container.querySelectorAll('[data-seat="1"] [aria-label="Face-down card"]'),
    ).toHaveLength(1);

    act(() => vi.advanceTimersByTime(2_000));
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-seat="1"] [aria-label="Face-down card"]'),
    ).toHaveLength(5);
    expect(container.querySelector('[data-table-screen]')?.getAttribute('data-deal-state')).toBe(
      'complete',
    );
  });

  it('paints named Euchre moments after shared card flights', () => {
    const fx: FxEvent[] = [
      {
        kind: Fx.DealCard,
        payload: { card: 'H9', from: 'stock', to: 'hand:0', dur: 220 },
        at: 0,
      },
      {
        kind: 'euchre.hand-score',
        payload: { reason: 'march', points: 2, makerTeam: 0 },
        at: 0,
      },
    ];

    act(() =>
      root.render(createElement(EuchreTableScreen, { view: VIEW, fx, fxKey: 'layer-order' })),
    );

    const layers = [...container.querySelectorAll(`.${tableStyles.fxLayer}`)];
    expect(layers).toHaveLength(2);
    expect(layers[0]?.querySelector('[data-flight-card]')).not.toBeNull();
    expect(layers[1]?.textContent).toContain('MARCH!');
  });
});
