import { act, createElement } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMusicController } from '@/lib/audio/MusicController';
import type { WildTableView } from '@/lib/wild/view';
import { fanOpenAtMs } from '@/lib/table/arrival-presentation';
import { FX_TIMING } from '@/lib/table/fx-motion';
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
      lastCardArmed: false,
    },
    {
      seat: 1,
      name: 'Slate',
      avatarId: 'slate',
      handCount: 5,
      isLocal: false,
      isBot: true,
      lastCardArmed: false,
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
  lastCardArmed: false,
  drawnCard: null,
  challenge: null,
  catchable: null,
  legal: {
    playCards: ['red-7-0'],
    draw: true,
    declineJump: false,
    chooseColor: false,
    callLastCard: false,
    catchLastCard: false,
    challengeDrawFour: false,
    pass: false,
    swapTargets: [],
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

    act(() => vi.advanceTimersByTime(220));
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

  it('automatically inserts cards into the Wild mobile order as the hand changes', () => {
    const hand = ['blue-9-0', 'red-skip-0', 'yellow-9-0', 'wild-0', 'red-3-0'];
    const view = { ...VIEW, hand, legal: { ...VIEW.legal, playCards: [] } };
    const labels = () =>
      [...container.querySelectorAll('[data-hand-card] button')].map((card) =>
        card.getAttribute('aria-label'),
      );

    act(() => root.render(createElement(WildTableScreen, { view, fx: [], fxKey: 0 })));
    expect(labels()).toEqual([
      'Play wild',
      'Play red 3',
      'Play red skip',
      'Play yellow 9',
      'Play blue 9',
    ]);
    const renderGameToText = (window as unknown as { render_game_to_text: () => string })
      .render_game_to_text;
    expect(JSON.parse(renderGameToText()).hand).toEqual([
      'wild-0',
      'red-3-0',
      'red-skip-0',
      'yellow-9-0',
      'blue-9-0',
    ]);

    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...view,
            hand: [...hand, 'green-1-0'],
            drawnCard: 'green-1-0',
          },
          fx: [],
          fxKey: 1,
        }),
      ),
    );

    expect(labels()).toEqual([
      'Play wild',
      'Play red 3',
      'Play red skip',
      'Play yellow 9',
      'Play green 1',
      'Play blue 9',
    ]);
    expect(
      container.querySelector('[aria-label="Play green 1"]')?.closest('[data-just-drawn]'),
    ).not.toBeNull();
  });

  it('offers the catch even off turn, and shouts the exposed seat by name', () => {
    const onCatchLastCard = vi.fn();
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...VIEW,
            activeSeat: 1,
            decision: null,
            catchable: { seat: 1, name: 'Slate' },
            legal: { ...VIEW.legal, playCards: [], draw: false, catchLastCard: true },
          },
          fx: [],
          fxKey: 0,
          busy: true,
          onCatchLastCard,
        }),
      ),
    );

    const button = container.querySelector<HTMLButtonElement>('[data-testid="catch-last-card"]');
    expect(button?.textContent).toBe('Catch Slate!');
    act(() => button?.click());
    expect(onCatchLastCard).toHaveBeenCalledOnce();
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

  it('lifts the song Mario-Kart style for the final minute and releases it when the hand ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    const matchEndsAt = Date.now() + 90_000;
    act(() =>
      root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0, matchEndsAt })),
    );
    // No tense-track swap anymore, and no lift outside the final minute.
    expect(getMusicController().getState().mood).toBeNull();
    expect(getMusicController().getState().rate).toBe(1);

    act(() => void vi.advanceTimersByTime(31_000));
    expect(getMusicController().getState().rate).toBeCloseTo(1.07);
    expect(getMusicController().getState().mood).toBeNull();

    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, activeSeat: null, decision: null },
          fx: [],
          fxKey: 0,
          matchEndsAt,
        }),
      ),
    );
    expect(getMusicController().getState().rate).toBe(1);
  });

  it('ducks the music under the time-up flutter as the clock zeroes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    const matchEndsAt = Date.now() + 61_000;
    act(() =>
      root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0, matchEndsAt })),
    );
    expect(getMusicController().getState().duck).toBe(1);

    act(() => void vi.advanceTimersByTime(61_000));
    expect(getMusicController().getState().duck).toBeCloseTo(0.45);

    // The engine ends the match a beat later; the lift releases, the duck holds.
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, activeSeat: null, decision: null },
          fx: [],
          fxKey: 0,
          matchEndsAt,
        }),
      ),
    );
    expect(getMusicController().getState().rate).toBe(1);
    expect(getMusicController().getState().duck).toBeCloseTo(0.45);

    act(() => root.unmount());
    root = createRoot(container);
    expect(getMusicController().getState().duck).toBe(1);
  });

  it('shows live places and the frantic lift from the real final-minute deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: VIEW,
          fx: [],
          fxKey: 0,
          matchEndsAt: Date.now() + 59_000,
        }),
      ),
    );

    const standings = container.querySelector('[aria-label="Live standings"]');
    expect(standings?.textContent).toContain('59s left');
    expect(standings?.textContent).toContain('1stYou2 cards');
    expect(standings?.textContent).toContain('2ndSlate5 cards');
    expect(getMusicController().getState().rate).toBeCloseTo(1.07);
    expect(getMusicController().getState().mood).toBeNull();
  });

  it('keeps the game clock visible and counts the turn down on a circular progress ring', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: VIEW,
          fx: [],
          fxKey: 0,
          matchEndsAt: Date.now() + 300_000,
          turnDurationMs: 15_000,
          turnClockKey: '0:0',
        }),
      ),
    );

    expect(container.querySelector('[aria-label="Game clock"]')?.textContent).toBe('Game5:00');
    expect(container.querySelector('[data-testid="turn-clock"]')?.textContent).toBe('You15');
    // The ring sweeps from CSS over the turn's own duration rather than from a
    // ten-times-a-second render, so the clock publishes the duration and the
    // stylesheet animates it.
    const progress = container.querySelector<SVGCircleElement>(
      '[data-testid="turn-clock-progress"]',
    );
    expect(progress).not.toBeNull();
    expect(
      container
        .querySelector<HTMLElement>('[data-testid="turn-clock"]')
        ?.style.getPropertyValue('--turn-duration'),
    ).toBe('15000ms');

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.querySelector('[aria-label="Game clock"]')?.textContent).toBe('Game4:59');
    expect(container.querySelector('[data-testid="turn-clock"]')?.textContent).toBe('You14');
  });

  it('places a two-player opponent directly across from every local seat', () => {
    act(() => root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0 })));
    expect(container.querySelector('[data-seat="0"]')?.getAttribute('data-table-position')).toBe(
      '0',
    );
    expect(container.querySelector('[data-seat="1"]')?.getAttribute('data-table-position')).toBe(
      '2',
    );

    const oppositeView: WildTableView = {
      ...VIEW,
      localSeat: 1,
      players: VIEW.players.map((player) => ({
        ...player,
        isLocal: player.seat === 1,
      })),
    };
    act(() =>
      root.render(createElement(WildTableScreen, { view: oppositeView, fx: [], fxKey: 1 })),
    );
    expect(container.querySelector('[data-seat="1"]')?.getAttribute('data-table-position')).toBe(
      '0',
    );
    expect(container.querySelector('[data-seat="0"]')?.getAttribute('data-table-position')).toBe(
      '2',
    );
  });

  it('renders swap cards flying between the two correct hand zones', () => {
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: VIEW,
          fx: [
            {
              kind: 'wildpile.transfer',
              payload: { card: 'red-7-0', from: 'hand:0', to: 'hand:1', dur: 240 },
            },
          ],
          fxKey: 'swap',
        }),
      ),
    );

    expect(container.querySelector('[data-fx-cue="0:wildpile.transfer"]')).not.toBeNull();
    expect(
      container.querySelector('[data-fx-cue="0:wildpile.transfer"] [aria-label="red 7"]'),
    ).not.toBeNull();
  });

  it('draws from the deck itself and ships no draw button', () => {
    const onDraw = vi.fn();
    act(() =>
      root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0, onDraw })),
    );

    const buttons = [...container.querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons.some((label) => label?.trim() === 'Draw')).toBe(false);

    const stock = container.querySelector<HTMLButtonElement>('[data-zone="stock"]');
    expect(stock?.getAttribute('data-can-draw')).toBe('true');
    act(() => stock?.click());
    expect(onDraw).toHaveBeenCalledOnce();
  });

  it('offers last-card protection only when the engine does, then shows it armed', () => {
    const onCallLastCard = vi.fn();
    act(() => root.render(createElement(WildTableScreen, { view: VIEW, fx: [], fxKey: 0 })));
    expect(container.querySelector('[data-testid="call-last-card"]')).toBeNull();

    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, legal: { ...VIEW.legal, callLastCard: true } },
          fx: [],
          fxKey: 0,
          onCallLastCard,
        }),
      ),
    );
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="call-last-card"]')?.click(),
    );
    expect(onCallLastCard).toHaveBeenCalledOnce();

    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, lastCardArmed: true },
          fx: [],
          fxKey: 1,
        }),
      ),
    );
    expect(container.querySelector('[data-testid="last-card-armed"]')).not.toBeNull();
  });

  it('announces skips, reverses and penalties instead of only playing a sound', () => {
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, direction: -1 },
          fx: [
            { kind: 'wildpile.skip', payload: { seat: 1 } },
            { kind: 'wildpile.reverse', payload: { direction: -1, seat: 0 } },
            { kind: 'wildpile.caught', payload: { seat: 1, amount: 2 }, at: 300 },
          ],
          fxKey: 'calls',
        }),
      ),
    );

    const announcer = container.querySelector('[data-testid="wild-announcer"]');
    expect(announcer?.textContent).toContain('Reverse');
    expect(announcer?.textContent).toContain('Skipped');
    expect(announcer?.textContent).toContain('Caught!');
    expect(announcer?.textContent).toContain('Slate loses a turn');
    expect(container.querySelector('[data-seat="1"] [data-stamp]')).not.toBeNull();
    expect(container.querySelector('[data-direction="-1"]')).not.toBeNull();
  });

  it('calls the color on a quartered wheel', () => {
    const onChooseColor = vi.fn();
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: { ...VIEW, decision: 'choose-color', legal: { ...VIEW.legal, chooseColor: true } },
          fx: [],
          fxKey: 0,
          onChooseColor,
        }),
      ),
    );

    const wheel = container.querySelector('[data-testid="color-wheel"]');
    const wedges = wheel?.querySelectorAll<HTMLButtonElement>('[data-wedge]') ?? [];
    expect(wedges).toHaveLength(4);
    expect([...wedges].map((wedge) => wedge.dataset.color)).toEqual([
      'red',
      'yellow',
      'green',
      'blue',
    ]);

    act(() => wedges[2]?.click());
    expect(onChooseColor).toHaveBeenCalledWith('green');
  });

  it('names a hand to take when a swap card lands', () => {
    const onChooseTarget = vi.fn();
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...VIEW,
            decision: 'choose-target',
            legal: { ...VIEW.legal, playCards: [], draw: false, swapTargets: [1] },
          },
          fx: [],
          fxKey: 0,
          onChooseTarget,
        }),
      ),
    );

    const target = container.querySelector<HTMLButtonElement>(
      '[data-testid="swap-chooser"] button',
    );
    expect(target?.getAttribute('aria-label')).toBe('Swap hands with Slate, 5 cards');
    act(() => target?.click());
    expect(onChooseTarget).toHaveBeenCalledWith(1);
  });

  it('lifts the card just drawn and offers to keep it', () => {
    const onPass = vi.fn();
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...VIEW,
            drawnCard: 'blue-2-0',
            legal: { ...VIEW.legal, playCards: ['blue-2-0'], draw: false, pass: true },
          },
          fx: [],
          fxKey: 0,
          onPass,
        }),
      ),
    );

    expect(
      container.querySelector('[aria-label="Play blue 2"]')?.closest('[data-just-drawn]'),
    ).not.toBeNull();
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="pass-drawn-card"]')?.click(),
    );
    expect(onPass).toHaveBeenCalledOnce();
  });

  it('throws a card-drop flourish when a card lands on the pile', () => {
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: VIEW,
          fx: [{ kind: Fx.DiscardCard, payload: { card: 'red-reverse-0', seat: 1 }, at: 0 }],
          fxKey: 'drop',
        }),
      ),
    );

    const layer = container.querySelector('[data-testid="card-drop-fx"]');
    expect(layer?.querySelector('[data-shape="swirl"]')).not.toBeNull();
  });

  it('renders and announces a Drop All color dump', () => {
    const view = {
      ...VIEW,
      hand: ['red-discard-all-0', 'blue-2-0'],
      legal: { ...VIEW.legal, playCards: ['red-discard-all-0'] },
    };
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view,
          fx: [
            {
              kind: Fx.DiscardCard,
              payload: { card: 'red-discard-all-0', seat: 0 },
              at: 130,
            },
            {
              kind: 'wildpile.discard-all',
              payload: { seat: 0, color: 'red', amount: 3 },
              at: 130,
            },
          ],
          fxKey: 'drop-all',
        }),
      ),
    );

    expect(container.querySelector('[aria-label="Play red drop all"]')).not.toBeNull();
    expect(container.querySelector('[data-shape="shockwave"]')?.textContent).toContain('ALL');
    expect(container.querySelector('[data-testid="wild-announcer"]')?.textContent).toContain(
      'Drop all!',
    );
    expect(container.querySelector('[data-testid="wild-announcer"]')?.textContent).toContain(
      'You shed 3 red cards',
    );
  });

  it('offers the Draw Four challenge with both prices on it', () => {
    const onChallengeDrawFour = vi.fn();
    const onDraw = vi.fn();
    act(() =>
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...VIEW,
            pendingDraw: 4,
            challenge: { accused: 1, accusedName: 'Slate', amount: 4, penalty: 6 },
            legal: { ...VIEW.legal, playCards: [], challengeDrawFour: true },
          },
          fx: [],
          fxKey: 0,
          onChallengeDrawFour,
          onDraw,
        }),
      ),
    );

    const prompt = container.querySelector('[data-testid="challenge-prompt"]');
    expect(prompt?.textContent).toContain('Slate played a Draw Four');
    expect(prompt?.textContent).toContain('they take 4');
    expect(prompt?.textContent).toContain('you take 6');

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="accept-draw-four"]')?.click(),
    );
    expect(onDraw).toHaveBeenCalledOnce();
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="challenge-draw-four"]')?.click(),
    );
    expect(onChallengeDrawFour).toHaveBeenCalledOnce();
  });

  it('counts a stacked pickup out card by card instead of dumping it', () => {
    vi.useFakeTimers();
    const fx = [
      { kind: 'wildpile.pickup', payload: { seat: 0, amount: 4, reason: 'penalty' }, at: 300 },
      { kind: Fx.DrawCard, payload: { card: 'red-1-0', seat: 0, from: 'stock' }, at: 300 },
      { kind: Fx.DrawCard, payload: { card: 'red-2-0', seat: 0, from: 'stock' }, at: 450 },
      { kind: Fx.DrawCard, payload: { card: 'red-3-0', seat: 0, from: 'stock' }, at: 600 },
      { kind: Fx.DrawCard, payload: { card: 'red-4-0', seat: 0, from: 'stock' }, at: 750 },
    ];
    act(() => root.render(createElement(WildTableScreen, { view: VIEW, fx, fxKey: 'pickup' })));

    const counter = () => container.querySelector('[data-testid="wild-pickup"]');
    expect(counter()?.getAttribute('data-active')).toBe('false');

    // Nothing until the first card is actually in the air.
    act(() => void vi.advanceTimersByTime(310));
    expect(counter()?.getAttribute('data-active')).toBe('true');
    expect(counter()?.textContent).toContain('You pick up');
    expect(counter()?.textContent).toContain('+4');
    expect(counter()?.textContent).toContain('0 of 4');

    act(() => void vi.advanceTimersByTime(200));
    expect(counter()?.textContent).toContain('1 of 4');
    expect(counter()?.querySelectorAll('[data-landed]')).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(450));
    expect(counter()?.querySelectorAll('[data-landed]')).toHaveLength(4);
    expect(counter()?.textContent).toContain('Turn lost');

    // ...then it releases the table rather than sitting there.
    act(() => void vi.advanceTimersByTime(900));
    expect(counter()?.getAttribute('data-active')).toBe('false');
  });

  it('opens a fan gap late in the flight, then hands the card into that slot', () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        createElement(WildTableScreen, {
          view: {
            ...VIEW,
            hand: [...VIEW.hand, 'green-4-0'],
            drawnCard: 'green-4-0',
          },
          fx: [
            { kind: Fx.DrawCard, payload: { card: 'green-4-0', seat: 0, from: 'stock' }, at: 0 },
          ],
          fxKey: 'draw-handoff',
        }),
      );
    });

    const slot = () => container.querySelector('[data-card-id="green-4-0"]');
    const rail = () => container.querySelector('[data-zone="hand:0"]');
    expect(slot()).toBeNull();
    expect(rail()?.getAttribute('data-receiving')).toBe('true');
    expect(rail()?.getAttribute('data-fan-plan')?.split(',')).toContain('green-4-0');

    const openAt = fanOpenAtMs({ startMs: 0, durationMs: FX_TIMING.drawFlightMs });
    act(() => void vi.advanceTimersByTime(openAt - 1));
    expect(slot()).toBeNull();

    act(() => void vi.advanceTimersByTime(1));
    expect(slot()?.getAttribute('data-arriving')).toBe('true');
    expect(slot()?.getAttribute('data-flight-target')).toBe('green-4-0');
    expect(slot()?.getAttribute('aria-hidden')).toBe('true');

    act(() => void vi.advanceTimersByTime(FX_TIMING.drawFlightMs - openAt - 1));
    expect(slot()?.getAttribute('data-arriving')).toBe('true');

    act(() => void vi.advanceTimersByTime(1));
    expect(slot()?.getAttribute('data-arriving')).toBeNull();
    expect(slot()?.getAttribute('aria-hidden')).toBeNull();
    expect(slot()?.getAttribute('data-just-drawn')).toBe('true');
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
