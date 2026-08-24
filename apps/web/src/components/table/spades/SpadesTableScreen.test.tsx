import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spadesConfig } from '@parlour/game-spades';
import { useProfileStore } from '@/stores/profile';
import { SpadesTableScreen } from './SpadesTableScreen';
import type { SpadesTableView } from '@/lib/spades/view';

const RULES = spadesConfig.resolve({});

const HAND = ['C2', 'C7', 'C13', 'D3', 'D9', 'D12', 'H4', 'H8', 'H11', 'S1', 'S5', 'S10', 'S13'];

function makeView(overrides: Partial<SpadesTableView> = {}): SpadesTableView {
  return {
    localSeat: 0,
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      name: seat === 0 ? 'You' : (['Ruth', 'Cal', 'Iris'][seat - 1] ?? `Seat ${seat}`),
      avatarId: seat === 0 ? 'ember' : 'slate',
      isLocal: seat === 0,
      isBot: seat !== 0,
      team: (seat % 2) as 0 | 1,
      handCount: 13,
      isDealer: seat === 3,
      bid: null,
      tricksWon: 0,
    })),
    activeSeat: 0,
    stageLabel: 'classic · bidding 0 of 4',
    stage: 'bidding',
    scores: [0, 0],
    bags: [0, 0],
    targetScore: 500,
    teams: [
      {
        team: 0,
        score: 0,
        bags: 0,
        contract: 0,
        tricks: 0,
        nilTricks: 0,
        nilSeats: [],
        label: 'You & partner',
      },
      {
        team: 1,
        score: 0,
        bags: 0,
        contract: 0,
        tricks: 0,
        nilTricks: 0,
        nilSeats: [],
        label: 'Openers',
      },
    ],
    handNo: 1,
    dealer: 3,
    turn: 0,
    trick: [],
    leader: null,
    ledSuit: null,
    spadesBroken: false,
    overtime: false,
    tricksPlayed: 0,
    lastTrickWinner: null,
    hand: HAND,
    legalCards: [],
    bidOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    canBidNil: true,
    decision: 'bid',
    lastHand: null,
    matchOver: false,
    mode: 'classic',
    rules: RULES,
    ...overrides,
  };
}

function playingView(overrides: Partial<SpadesTableView> = {}): SpadesTableView {
  return makeView({
    stage: 'playing',
    stageLabel: 'classic · trick 1 of 13',
    decision: 'play',
    legalCards: ['C2', 'C7', 'C13'],
    bidOptions: [],
    canBidNil: false,
    players: makeView().players.map((player) => ({
      ...player,
      bid: { seat: player.seat, tricks: 3, nil: false },
    })),
    teams: [
      {
        team: 0,
        score: 0,
        bags: 0,
        contract: 6,
        tricks: 0,
        nilTricks: 0,
        nilSeats: [],
        label: 'You & partner',
      },
      {
        team: 1,
        score: 0,
        bags: 0,
        contract: 6,
        tricks: 0,
        nilTricks: 0,
        nilSeats: [],
        label: 'Openers',
      },
    ],
    ...overrides,
  });
}

function textSurface() {
  return JSON.parse(
    (window as unknown as { render_game_to_text: () => string }).render_game_to_text(),
  );
}

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

describe('SpadesTableScreen', () => {
  // --- bidding -------------------------------------------------------------

  it('offers every legal bid plus a distinct Nil action', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    const chips = container.querySelectorAll('[data-testid="spades-bid"]');
    expect(chips).toHaveLength(13);
    expect([...chips].map((chip) => chip.getAttribute('data-bid'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
    ]);
    expect(container.querySelector('[data-testid="spades-bid-nil"]')).not.toBeNull();
  });

  it('reports the chosen bid, and nil through its own callback', () => {
    const bids: number[] = [];
    let nils = 0;
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView(),
          fx: [],
          fxKey: 'k',
          onBid: (bid: number) => bids.push(bid),
          onBidNil: () => {
            nils += 1;
          },
        }),
      ),
    );
    const chip = container.querySelector<HTMLButtonElement>('[data-bid="7"]')!;
    act(() => chip.click());
    expect(bids).toEqual([7]);
    const nil = container.querySelector<HTMLButtonElement>('[data-testid="spades-bid-nil"]')!;
    act(() => nil.click());
    expect(nils).toBe(1);
    // Nil must never arrive as a bid of zero.
    expect(bids).toEqual([7]);
  });

  it('hides the Nil action when the table does not allow it', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView({ canBidNil: false }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    expect(container.querySelector('[data-testid="spades-bid-nil"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="spades-bid"]')).toHaveLength(13);
  });

  it('drives the bid rail from the keyboard as a roving radiogroup', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    const rail = container.querySelector<HTMLElement>('[data-testid="spades-bid-rail"]')!;
    const chips = [...rail.querySelectorAll<HTMLButtonElement>('[data-testid="spades-bid"]')];
    // exactly one chip is in the tab order at a time
    expect(chips.filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    expect(chips[0]!.tabIndex).toBe(0);

    act(() => {
      rail.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });
    expect(chips[1]!.tabIndex).toBe(0);
    expect(chips[0]!.tabIndex).toBe(-1);

    act(() => {
      rail.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
      );
    });
    expect(chips[12]!.tabIndex).toBe(0);
  });

  it('types a two-digit bid and picks Nil with the n key', () => {
    let nils = 0;
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView(),
          fx: [],
          fxKey: 'k',
          onBidNil: () => {
            nils += 1;
          },
        }),
      ),
    );
    const rail = container.querySelector<HTMLElement>('[data-testid="spades-bid-rail"]')!;
    const chips = [...rail.querySelectorAll<HTMLButtonElement>('[data-testid="spades-bid"]')];

    // "1" then "3" must land on 13, not on 1 and then 3.
    act(() => {
      rail.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }),
      );
    });
    expect(chips[0]!.tabIndex).toBe(0);
    act(() => {
      rail.dispatchEvent(
        new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }),
      );
    });
    expect(chips[12]!.tabIndex).toBe(0);

    act(() => {
      rail.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }),
      );
    });
    expect(nils).toBe(1);
  });

  it('shows no bid rail once bidding is over', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx: [], fxKey: 'k' })),
    );
    expect(container.querySelector('[data-testid="spades-bid-rail"]')).toBeNull();
  });

  // --- card play -----------------------------------------------------------

  it('exposes a stable per-card selector for all thirteen cards', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx: [], fxKey: 'k' })),
    );
    const cards = container.querySelectorAll('[data-card]');
    expect(cards).toHaveLength(13);
    expect(container.querySelector('[data-card="S13"]')).not.toBeNull();
  });

  it('plays only legal cards and marks the rest unplayable', () => {
    const played: string[] = [];
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView(),
          fx: [],
          fxKey: 'k',
          onPlay: (card: string) => played.push(card),
        }),
      ),
    );
    const legal = container
      .querySelector('[data-card="C2"]')!
      .querySelector<HTMLButtonElement>('button')!;
    act(() => legal.click());
    expect(played).toEqual(['C2']);

    const illegal = container
      .querySelector('[data-card="S13"]')!
      .querySelector<HTMLButtonElement>('button')!;
    expect(illegal.disabled).toBe(true);
    act(() => illegal.click());
    expect(played).toEqual(['C2']);
  });

  it('locks the hand while another seat is acting', () => {
    const played: string[] = [];
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({ activeSeat: 1, decision: null }),
          fx: [],
          fxKey: 'k',
          busy: true,
          onPlay: (card: string) => played.push(card),
        }),
      ),
    );
    const card = container
      .querySelector('[data-card="C2"]')!
      .querySelector<HTMLButtonElement>('button')!;
    expect(card.disabled).toBe(true);
    act(() => card.click());
    expect(played).toEqual([]);
  });

  // --- partnership furniture ----------------------------------------------

  it('publishes both partnerships with bags, contract and tricks', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({
            teams: [
              {
                team: 0,
                score: 320,
                bags: 9,
                contract: 6,
                tricks: 4,
                nilTricks: 0,
                nilSeats: [],
                label: 'You & partner',
              },
              {
                team: 1,
                score: 180,
                bags: 2,
                contract: 7,
                tricks: 3,
                nilTricks: 0,
                nilSeats: [{ seat: 1, intact: true }],
                label: 'Openers',
              },
            ],
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const teams = container.querySelectorAll('[data-testid="spades-team"]');
    expect(teams).toHaveLength(2);
    expect(teams[0]!.getAttribute('data-bags')).toBe('9');
    expect(teams[0]!.getAttribute('data-contract')).toBe('6');
    expect(teams[0]!.getAttribute('data-tricks')).toBe('4');
    expect(teams[1]!.getAttribute('data-bags')).toBe('2');
    // the nil badge rides the partnership that called it
    expect(teams[1]!.querySelectorAll('[class*="nilBadge"]')).toHaveLength(1);
  });

  it('shows a per-seat bid chip, and nil as a word rather than a zero', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({
            players: makeView().players.map((player) => ({
              ...player,
              bid:
                player.seat === 1
                  ? { seat: 1, tricks: 0, nil: true }
                  : { seat: player.seat, tricks: 4, nil: false },
              tricksWon: player.seat === 1 ? 0 : 2,
            })),
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const chips = container.querySelectorAll('[data-testid="spades-seat-bid"]');
    expect(chips).toHaveLength(4);
    const nilChip = container.querySelector('[data-seat="1"] [data-testid="spades-seat-bid"]')!;
    expect(nilChip.getAttribute('data-nil')).toBe('true');
    // The bid itself reads "nil"; the trailing 0 is the tricks-taken counter,
    // which for a nil seat is the whole story — it is still intact.
    expect(nilChip.querySelector('b')!.textContent).toBe('nil');
    expect(nilChip.querySelector('i')!.textContent).toBe('0');
    const plainChip = container.querySelector('[data-seat="0"] [data-testid="spades-seat-bid"]')!;
    expect(plainChip.querySelector('b')!.textContent).toBe('4');
    expect(plainChip.hasAttribute('data-nil')).toBe(false);
  });

  it('flags whether spades are broken', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx: [], fxKey: 'k' })),
    );
    expect(container.querySelector('[data-spades-broken="false"]')).not.toBeNull();

    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({ spadesBroken: true }),
          fx: [],
          fxKey: 'k2',
        }),
      ),
    );
    expect(container.querySelector('[data-spades-broken="true"]')).not.toBeNull();
  });

  it('renders the trick as it fills', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({
            trick: [
              { seat: 1, card: 'C5' },
              { seat: 2, card: 'C9' },
            ],
            ledSuit: 'C',
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const zone = container.querySelector('[data-zone="trick"]')!;
    expect(zone.querySelectorAll('[data-seat]')).toHaveLength(2);
  });

  // --- fx ------------------------------------------------------------------

  it('animates trick flights and the hand-score sheet purely from fx cues', () => {
    const fx = [
      { kind: 'tricks.play', payload: { card: 'C2', seat: 0, index: 0 }, at: 0 },
      { kind: 'tricks.collect', payload: { seat: 2, cards: ['C2'], count: 4 }, at: 120 },
      {
        kind: 'spades.hand-score',
        payload: {
          handNo: 1,
          teams: [
            {
              team: 0,
              contract: 6,
              nonNilTricks: 7,
              made: true,
              delta: 61,
              bagsTaken: 1,
              bagPenalty: 0,
              total: 61,
              bags: 1,
            },
            {
              team: 1,
              contract: 7,
              nonNilTricks: 6,
              made: false,
              delta: -70,
              bagsTaken: 0,
              bagPenalty: 0,
              total: -70,
              bags: 0,
            },
          ],
        },
        at: 300,
      },
    ];
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx, fxKey: 'k' })),
    );
    expect(container.querySelectorAll('[data-fx-cue]').length).toBeGreaterThanOrEqual(3);
    const sheet = container.querySelector('[data-testid="spades-hand-score"]')!;
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain('made');
    expect(sheet.textContent).toContain('set');
    expect(sheet.textContent).toContain('+61');
    expect(sheet.textContent).toContain('-70');
  });

  // --- render_game_to_text -------------------------------------------------

  it('publishes the frozen render_game_to_text surface', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({
            scores: [120, 90],
            bags: [3, 7],
            tricksPlayed: 4,
            spadesBroken: true,
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const text = textSurface();
    expect(text.game).toBe('spades');
    expect(text.status).toBe('ready');
    expect(text.decision).toBe('play');
    expect(text.scores).toEqual([120, 90]);
    expect(text.bags).toEqual([3, 7]);
    expect(text.contracts).toEqual([6, 6]);
    expect(text.spadesBroken).toBe(true);
    expect(text.overtime).toBe(false);
    expect(text.hand).toHaveLength(13);
    expect(text.legalCards).toEqual(['C2', 'C7', 'C13']);
    expect(text.tricksWon).toEqual([0, 0, 0, 0]);
    expect(text.bids).toEqual([3, 3, 3, 3]);
  });

  it('serialises a nil bid as "nil", never as 0', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: playingView({
            players: makeView().players.map((player) => ({
              ...player,
              bid:
                player.seat === 2
                  ? { seat: 2, tricks: 0, nil: true }
                  : { seat: player.seat, tricks: 3, nil: false },
            })),
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    expect(textSurface().bids).toEqual([3, 3, 'nil', 3]);
  });

  it('reports the bid decision and its options while bidding', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    const text = textSurface();
    expect(text.decision).toBe('bid');
    expect(text.bidOptions).toHaveLength(13);
    expect(text.canBidNil).toBe(true);
    expect(text.bids).toEqual([null, null, null, null]);
  });

  it('reports loading and error states without a view', () => {
    act(() => root.render(createElement(SpadesTableScreen, { view: null, fx: [], fxKey: 'k' })));
    expect(textSurface().status).toBe('loading');

    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: null,
          fx: [],
          fxKey: 'k',
          error: 'the table lost the thread',
        }),
      ),
    );
    expect(textSurface().status).toBe('error');
  });

  it('removes the text surface on unmount', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    expect(
      (window as unknown as { render_game_to_text?: () => string }).render_game_to_text,
    ).toBeTypeOf('function');
    act(() => root.unmount());
    expect(
      (window as unknown as { render_game_to_text?: () => string }).render_game_to_text,
    ).toBeUndefined();
    root = createRoot(container);
  });
});

// ---------------------------------------------------------------------------
// review fixups
// ---------------------------------------------------------------------------

const SUMMARY = {
  handNo: 3,
  dealer: 3,
  bids: [
    { seat: 0, tricks: 0, nil: true },
    { seat: 1, tricks: 3, nil: false },
    { seat: 2, tricks: 4, nil: false },
    { seat: 3, tricks: 3, nil: false },
  ],
  tricksBySeat: [2, 4, 4, 3],
  teams: [
    {
      team: 0 as const,
      contract: 4,
      nonNilTricks: 4,
      nilTricks: 2,
      made: true,
      contractDelta: 40,
      nilDelta: -100,
      overtricks: 0,
      bagsTaken: 2,
      bagPenalty: 100,
      delta: -160,
      scoreAfter: 140,
      bagsAfter: 1,
    },
    {
      team: 1 as const,
      contract: 6,
      nonNilTricks: 7,
      nilTricks: 0,
      made: true,
      contractDelta: 60,
      nilDelta: 0,
      overtricks: 1,
      bagsTaken: 1,
      bagPenalty: 0,
      delta: 61,
      scoreAfter: 261,
      bagsAfter: 4,
    },
  ],
};

describe('SpadesTableScreen last-hand summary', () => {
  it('keeps the previous hand readable after the table auto-deals, with no fx at all', () => {
    // The open table deals the next hand immediately, so `fx` is empty by the
    // time a player looks up. The summary must not depend on a 1.4s cue.
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView({ lastHand: SUMMARY as never, handNo: 4 }),
          fx: [],
          fxKey: 'after-deal',
        }),
      ),
    );
    const panel = container.querySelector('[data-testid="spades-last-hand"]')!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('status');
    expect(panel.getAttribute('aria-label')).toContain('Hand 3');
    expect(container.querySelectorAll('[data-testid="spades-last-hand-team"]')).toHaveLength(2);
  });

  it('shows the full breakdown: contract, nil, overtricks, bags, penalty, delta and total', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView({ lastHand: SUMMARY as never }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const rows = container.querySelectorAll('[data-testid="spades-last-hand-team"]');
    const us = rows[0]!.textContent ?? '';
    expect(us).toContain('4/4');
    expect(us).toContain('+40');
    expect(us).toContain('-100');
    expect(us).toContain('2 tricks taken');
    expect(us).toContain('-160');
    expect(us).toContain('140');
    expect(us).toContain('2 this hand');
    expect(us).toContain('1 on the card');
    // A bag penalty must name itself as points, not read as "-100 bags".
    const penalty = rows[0]!.querySelector('[data-testid="spades-bag-penalty"]')!;
    expect(penalty.textContent).toContain('bag penalty');
    // A typographic minus, matching the rest of the table's numerals.
    expect(penalty.textContent).toContain('\u2212100 points');
    expect(penalty.textContent).not.toContain('bags');

    const them = rows[1]!.textContent ?? '';
    expect(them).toContain('7/6');
    expect(them).toContain('+61');
    expect(them).toContain('261');
  });

  it('renders nothing before the first hand is scored', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    expect(container.querySelector('[data-testid="spades-last-hand"]')).toBeNull();
  });

  it('says the match is playing on when both teams cross the target', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView({ lastHand: SUMMARY as never, overtime: true, targetScore: 250 }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const flag = container.querySelector('[data-testid="spades-overtime"]')!;
    expect(flag.textContent).toContain('250');
    expect(flag.textContent).toContain('playing on');
  });

  it('publishes targetScore, matchOver, overtime and lastHand in the text surface', () => {
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView({
            lastHand: SUMMARY as never,
            overtime: true,
            matchOver: false,
            targetScore: 250,
          }),
          fx: [],
          fxKey: 'k',
        }),
      ),
    );
    const text = textSurface();
    expect(text.targetScore).toBe(250);
    expect(text.matchOver).toBe(false);
    expect(text.overtime).toBe(true);
    expect(text.lastHand.handNo).toBe(3);
    expect(text.lastHand.teams).toHaveLength(2);
    expect(text.lastHand.teams[0].bagPenalty).toBe(100);
  });
});

describe('SpadesTableScreen bid rail semantics', () => {
  it('is a toolbar of buttons, because moving focus is not choosing a bid', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: makeView(), fx: [], fxKey: 'k' })),
    );
    const rail = container.querySelector('[data-testid="spades-bid-rail"]')!;
    expect(rail.getAttribute('role')).toBe('toolbar');
    const chips = [...rail.querySelectorAll('[data-testid="spades-bid"]')];
    // No chip may claim to be selected merely because it holds focus.
    expect(chips.some((chip) => chip.hasAttribute('aria-checked'))).toBe(false);
    expect(chips.every((chip) => chip.getAttribute('role') === null)).toBe(true);
  });

  it('dispatches exactly once for a native Enter, and never twice', () => {
    const bids: number[] = [];
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView(),
          fx: [],
          fxKey: 'k',
          onBid: (bid: number) => bids.push(bid),
        }),
      ),
    );
    const rail = container.querySelector<HTMLElement>('[data-testid="spades-bid-rail"]')!;
    const chip = container.querySelector<HTMLButtonElement>('[data-bid="5"]')!;
    act(() => {
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // A real browser turns that keydown into exactly one click.
      chip.click();
    });
    expect(bids).toEqual([5]);
    void rail;
  });

  it('ignores auto-repeat so a held key cannot machine-gun Nil', () => {
    let nils = 0;
    act(() =>
      root.render(
        createElement(SpadesTableScreen, {
          view: makeView(),
          fx: [],
          fxKey: 'k',
          onBidNil: () => {
            nils += 1;
          },
        }),
      ),
    );
    const rail = container.querySelector<HTMLElement>('[data-testid="spades-bid-rail"]')!;
    act(() => {
      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, repeat: true }));
      rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, repeat: true }));
    });
    expect(nils).toBe(1);
  });
});

describe('SpadesTableScreen calm motion', () => {
  it('leaves no delayed timeline when the profile asks for reduced motion', () => {
    vi.useFakeTimers();
    useProfileStore.setState((state) => ({
      ...state,
      settings: { ...state.settings, reducedMotion: true },
    }));
    const fx = [
      { kind: 'spades.bid', payload: { seat: 0, bid: 4, nil: false }, at: 300 },
      {
        kind: 'spades.hand-score',
        payload: { handNo: 1, teams: SUMMARY.teams },
        at: 1_200,
      },
    ];
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx, fxKey: 'calm' })),
    );

    const cues = [...container.querySelectorAll<HTMLElement>('[data-fx-cue]')];
    expect(cues.length).toBeGreaterThan(0);
    // Immediately — not after the cue's start, and not after its duration.
    for (const cue of cues) {
      expect(cue.style.visibility).toBe('hidden');
      expect(cue.style.opacity).toBe('0');
    }

    // Nothing may appear later either; a silent 1.7s wait is still a wait.
    act(() => void vi.advanceTimersByTime(5_000));
    for (const cue of container.querySelectorAll<HTMLElement>('[data-fx-cue]')) {
      expect(cue.style.visibility).toBe('hidden');
    }

    useProfileStore.setState((state) => ({
      ...state,
      settings: { ...state.settings, reducedMotion: false },
    }));
  });

  it('still animates when calm motion is off', () => {
    const fx = [{ kind: 'spades.bid', payload: { seat: 0, bid: 4, nil: false }, at: 300 }];
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx, fxKey: 'lively' })),
    );
    const cue = container.querySelector<HTMLElement>('[data-fx-cue]');
    expect(cue).not.toBeNull();
    // The lively path stages the cue for later rather than hiding it outright.
    expect(cue!.style.visibility).not.toBe('hidden');
  });
});

describe('SpadesTableScreen orientation', () => {
  it('asks for landscape rather than pretending thirteen cards fit in portrait', () => {
    act(() =>
      root.render(createElement(SpadesTableScreen, { view: playingView(), fx: [], fxKey: 'k' })),
    );
    const notice = container.querySelector('[data-testid="spades-rotate-notice"]')!;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toContain('sideways');
  });
});
