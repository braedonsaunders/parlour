import { Fx, type LegalMove } from '@parlour/engine';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartsTableScreen } from './HeartsTableScreen';
import type { HeartsTableView } from '@/lib/hearts/view';
import heartsStyles from '@/styles/hearts.module.css';
import tableStyles from '@/styles/table.module.css';

function makeView(overrides: Partial<HeartsTableView> = {}): HeartsTableView {
  return {
    mode: 'classic',
    localSeat: 0,
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      name: seat === 0 ? 'You' : (['Rose', 'Flint', 'Dove'][seat - 1] ?? `Seat ${seat}`),
      avatarId: seat === 0 ? 'ember' : 'slate',
      handCount: 13,
      score: 0,
      takenCount: 0,
      isLocal: seat === 0,
      isBot: seat !== 0,
    })),
    activeSeat: 0,
    phaseLabel: 'classic · trick 1 of 13',
    handNumber: 1,
    trick: [],
    ledSuit: null,
    heartsBroken: false,
    jackDiamonds: false,
    passDirection: null,
    awaitingPass: [],
    hand: ['C2', 'H5', 'D11'],
    decision: 'play',
    playableCards: ['C2'],
    handPoints: [0, 0, 0, 0],
    ...overrides,
  };
}

describe('HeartsTableScreen', () => {
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

  it('renders the trick cluster and lifts only legal cards on your turn', () => {
    const view = makeView({
      trick: [
        { card: 'C2', seat: 2 },
        { card: 'C9', seat: 3 },
      ],
      ledSuit: 'clubs',
      activeSeat: 0,
    });
    act(() =>
      root.render(
        createElement(HeartsTableScreen, {
          view,
          fx: [],
          fxKey: 'k1',
          onPlayCard: () => {},
        }),
      ),
    );
    const trickArea = container.querySelector('[data-zone="discard"]');
    expect(trickArea?.querySelector('[aria-label="2 of clubs"]')).not.toBeNull();
    expect(trickArea?.querySelector('[aria-label="9 of clubs"]')).not.toBeNull();
    expect(trickArea?.querySelectorAll('[data-trick-slot] > [data-trick-arrival]')).toHaveLength(2);
    const cards = [...container.querySelectorAll('[data-hand-card]')];
    expect(cards).toHaveLength(3);
    const playable = cards.filter((node) => node.getAttribute('data-playable') === 'true');
    expect(playable).toHaveLength(1);
    expect(container.querySelector('[data-table-screen]')).not.toBeNull();
  });

  it('centers the turn prompt on the felt instead of clipping it in the corner rail', () => {
    act(() =>
      root.render(createElement(HeartsTableScreen, { view: makeView(), fx: [], fxKey: 'turn' })),
    );

    const prompt = [...container.querySelectorAll('span')].find(
      (node) => node.textContent === 'Your turn',
    );
    expect(prompt?.classList.contains(heartsStyles.turnPrompt!)).toBe(true);
    expect(prompt?.closest(`.${tableStyles.playfield}`)).not.toBeNull();
    expect(prompt?.closest(`.${tableStyles.actionRail}`)).toBeNull();
  });

  it('shows the pass banner pips and confirm button once three cards are picked', () => {
    const view = makeView({
      decision: 'pass',
      passDirection: 'left',
      awaitingPass: [0],
      activeSeat: null,
    });
    act(() =>
      root.render(
        createElement(HeartsTableScreen, { view, fx: [], fxKey: 'k2', onPass: () => {} }),
      ),
    );
    const confirm = container.querySelector('[data-testid="confirm-pass"]') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    expect(confirm.disabled).toBe(true);
    expect(container.textContent).toContain('Pick 3 more');
  });

  it('renders the hand-end overlay with per-seat deltas and the moon stamp', () => {
    const view = makeView({ decision: null });
    act(() =>
      root.render(
        createElement(HeartsTableScreen, {
          view,
          fx: [],
          fxKey: 'k3',
          onNextHand: () => {},
          handEnd: {
            result: {
              winner: 1,
              reason: 'moon-shot',
              rankings: [
                { seat: 1, rank: 1, detail: { points: 0, moon: true } },
                { seat: 0, rank: 2, detail: { points: 26 } },
              ],
            },
            scores: [26, 0, 0, 0],
            matchOver: false,
          },
        }),
      ),
    );
    const overlay = container.querySelector('[data-testid="hand-end"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('MOON');
    expect(overlay?.textContent).toContain('+26 → 26');
    const next = overlay?.querySelector('[data-testid="next-hand"]');
    expect(next).not.toBeNull();
  });

  it('exposes render_game_to_text for browser verification', () => {
    const view = makeView();
    act(() => root.render(createElement(HeartsTableScreen, { view, fx: [], fxKey: 'k4' })));
    const rendered = JSON.parse(
      (window as unknown as { render_game_to_text: () => string }).render_game_to_text(),
    );
    expect(rendered.game).toBe('hearts');
    expect(rendered.decision).toBe('play');
    expect(rendered.playableCards).toEqual(['C2']);
    expect(rendered.hand).toHaveLength(3);
  });

  it('animates trick flights and collects purely from fx cues', () => {
    vi.useFakeTimers();
    const view = makeView();
    const fx = [
      {
        kind: 'tricks.play',
        payload: { card: 'C2', seat: 0, index: 0 },
        at: 0,
      },
      {
        kind: 'tricks.collect',
        payload: { seat: 2, cards: ['C2'], count: 1 },
        at: 120,
      },
    ];
    act(() => root.render(createElement(HeartsTableScreen, { view, fx, fxKey: 'k5' })));
    expect(container.querySelectorAll('[data-fx-cue]')).toHaveLength(2);
    void Fx.DealCard;
    void ({} as LegalMove);
  });
});
