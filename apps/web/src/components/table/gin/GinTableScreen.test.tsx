import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GinTableView } from '@/lib/gin/view';
import ginStyles from '@/styles/gin.module.css';
import { GinTableScreen } from './GinTableScreen';

const HAND = ['S1', 'S3', 'H4', 'H7', 'D2', 'D8', 'C5', 'C9', 'C11', 'C13'];

const VIEW: GinTableView = {
  players: [
    {
      seat: 0,
      name: 'You',
      avatarId: 'ember',
      handCount: 10,
      isLocal: true,
      isBot: false,
      score: 0,
      handsWon: 0,
      dealer: false,
    },
    {
      seat: 1,
      name: 'Marge',
      avatarId: 'marge',
      handCount: 10,
      isLocal: false,
      isBot: true,
      score: 0,
      handsWon: 0,
      dealer: true,
    },
  ],
  localSeat: 0,
  activeSeat: 0,
  handNumber: 1,
  matchTarget: 100,
  stockCount: 31,
  discard: ['C10'],
  upcard: 'C10',
  phaseLabel: 'The upcard',
  decision: 'option',
  hand: HAND,
  meldPreview: [],
  deadwood: 48,
  knockCap: 10,
  canKnock: false,
  legal: {
    takeUpcard: true,
    passUpcard: true,
    drawStock: false,
    drawDiscard: false,
    discardCards: [],
  },
  handEnd: null,
  matchOver: false,
};

describe('GinTableScreen', () => {
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

  it('gives every local card a full-width sizing shell inside the shared hand rail', () => {
    act(() => root.render(createElement(GinTableScreen, { view: VIEW, fx: [], fxKey: 0 })));

    const cards = [...container.querySelectorAll<HTMLElement>('[data-hand-card]')];
    expect(cards).toHaveLength(HAND.length);
    expect(cards.every((card) => card.querySelector(`.${ginStyles.handCardShell}`) !== null)).toBe(
      true,
    );
    expect(cards.every((card) => card.querySelector('button') !== null)).toBe(true);
  });

  it('removes table controls while the hand-result sheet owns the screen', () => {
    const handEndView: GinTableView = {
      ...VIEW,
      activeSeat: null,
      decision: 'hand-end',
      handEnd: {
        reason: 'gin',
        knocker: 0,
        scorer: 0,
        points: 25,
        deadwood: [0, 25],
        layoffs: [],
        meldsBySeat: [[], []],
        waitingFor: [0],
      },
      legal: {
        takeUpcard: false,
        passUpcard: false,
        drawStock: false,
        drawDiscard: false,
        discardCards: [],
      },
    };

    act(() =>
      root.render(createElement(GinTableScreen, { view: handEndView, fx: [], fxKey: 'hand-end' })),
    );

    expect(container.querySelector('[data-testid="hand-end-sheet"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll('button')].some((button) => button.textContent === 'Knock'),
    ).toBe(false);
  });
});
