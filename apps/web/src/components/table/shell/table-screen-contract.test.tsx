import { act, createElement, type ComponentType } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CribbageTableView } from '@/lib/cribbage/view';
import type { EuchreTableView } from '@/lib/euchre/view';
import type { GinTableView } from '@/lib/gin/view';
import type { HeartsTableView } from '@/lib/hearts/view';
import type { PresidentTableView } from '@/lib/president/view';
import type { RatscrewTableView } from '@/lib/ratscrew/view';
import type { WildTableView } from '@/lib/wild/view';
import tableStyles from '@/styles/table.module.css';
import { TableScreen, type TableView } from '../TableScreen';
import { CribbageTableScreen } from '../cribbage/CribbageTableScreen';
import { EuchreTableScreen } from '../euchre/EuchreTableScreen';
import { GinTableScreen } from '../gin/GinTableScreen';
import { HeartsTableScreen } from '../hearts/HeartsTableScreen';
import { PresidentTableScreen } from '../president/PresidentTableScreen';
import { RatscrewTableScreen } from '../ratscrew/RatscrewTableScreen';
import { WildTableScreen } from '../wild/WildTableScreen';

/**
 * The shell contract every shipped table screen must keep. Each entry names the
 * game's own copy and felt so the shared chassis can never quietly homogenise a
 * table's voice, and `dealState` records whether that table tracks a deal at all
 * — Rat Screw deliberately does not.
 */
type ScreenCase = {
  name: string;
  Screen: ComponentType<never>;
  view: unknown;
  /** The eyebrow the HUD pill must show. */
  eyebrow: string;
  /** aria-label on the felt. */
  playfield: string;
  /** The felt glyph, or null for tables that paint their own monogram. */
  feltMark: string | null;
  errorHeadline: string;
  loadingCopy: string;
  /** Whether the root publishes `data-deal-state`. */
  dealState: boolean;
  /** The `game` field its render_game_to_text surface reports. */
  gameText: string;
};

const BLITZ_VIEW: TableView = {
  players: [
    { seat: 0, name: 'You', avatarId: 'ember', hand: ['H1', 'S2', 'D3'], lives: 3, isLocal: true },
    { seat: 1, name: 'Juniper', avatarId: 'slate', hand: [], handCount: 3, lives: 2, isBot: true },
  ],
  activeSeat: 0,
  stockCount: 40,
  discard: ['D5'],
  phaseLabel: 'discard a card',
  legal: { drawStock: true, drawDiscard: true, discardCards: ['H1'], knock: true },
};

const GIN_VIEW: GinTableView = {
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
      avatarId: 'slate',
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
  hand: ['S1', 'S3', 'H4', 'H7', 'D2', 'D8', 'C5', 'C9', 'C11', 'C13'],
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

const HEARTS_VIEW: HeartsTableView = {
  mode: 'classic',
  localSeat: 0,
  players: [0, 1, 2, 3].map((seat) => ({
    seat,
    name: seat === 0 ? 'You' : `Seat ${seat}`,
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
};

const CRIBBAGE_VIEW: CribbageTableView = {
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
    discardPairs: [['S1', 'H5']],
    playCards: [],
    cut: false,
    claim: false,
    steal: false,
  },
};

const EUCHRE_VIEW: EuchreTableView = {
  players: [0, 1, 2, 3].map((seat) => ({
    seat,
    name: seat === 0 ? 'You' : `Seat ${seat}`,
    avatarId: seat === 0 ? 'ember' : 'slate',
    isLocal: seat === 0,
    isBot: seat !== 0,
    team: (seat % 2) as 0 | 1,
    handCount: 5,
    isDealer: seat === 0,
    isSittingOut: false,
  })),
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
  hand: ['H9', 'H10', 'H11', 'H12', 'H13'],
  legalCards: [],
  callSuits: [],
  canPass: true,
  decision: 'order-up',
  matchOver: false,
  mode: 'classic',
  rules: { targetScore: 10, stickDealer: true, goingAlone: true },
};

const PRESIDENT_VIEW: PresidentTableView = {
  players: [0, 1, 2, 3].map((seat) => ({
    seat,
    name: seat === 0 ? 'You' : `Seat ${seat}`,
    avatarId: seat === 0 ? 'ember' : 'slate',
    isBot: seat !== 0,
    isLocal: seat === 0,
    handCount: 13,
    score: 0,
    role: null,
  })),
  localSeat: 0,
  activeSeat: 0,
  dealNumber: 1,
  phaseLabel: 'deal 1 · lead anything',
  mode: 'classic',
  targetPoints: 5,
  pile: [],
  standing: null,
  hand: ['S3', 'H4', 'D5'],
  decision: 'lead-or-follow',
  giveCount: 0,
  returnCount: 0,
  legal: { playableCards: ['S3'], pass: false, give: false, returnCards: false },
  finishedOrder: [],
};

const RATSCREW_VIEW: RatscrewTableView = {
  players: [0, 1, 2, 3].map((seat) => ({
    seat,
    name: seat === 0 ? 'You' : `Bot ${seat}`,
    avatarId: seat === 0 ? 'ember' : 'slate',
    stackCount: 13,
    isLocal: seat === 0,
    isBot: seat !== 0,
  })),
  localSeat: 0,
  turnSeat: 0,
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

const WILD_VIEW: WildTableView = {
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
  legal: {
    playCards: ['red-7-0'],
    draw: true,
    declineJump: false,
    chooseColor: false,
    callLastCard: false,
    challengeDrawFour: false,
    pass: false,
    swapTargets: [],
  },
};

const SCREENS: readonly ScreenCase[] = [
  {
    name: 'blitz',
    Screen: TableScreen as ComponentType<never>,
    view: BLITZ_VIEW,
    eyebrow: 'Blitz',
    playfield: 'Blitz table',
    feltMark: '31',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Setting the table…',
    dealState: true,
    gameText: 'blitz',
  },
  {
    name: 'cribbage',
    Screen: CribbageTableScreen as ComponentType<never>,
    view: CRIBBAGE_VIEW,
    eyebrow: 'Cribbage',
    playfield: 'Cribbage table',
    feltMark: null,
    errorHeadline: 'The cribbage table lost the count.',
    loadingCopy: 'Drilling the peg holes…',
    dealState: true,
    gameText: 'cribbage',
  },
  {
    name: 'euchre',
    Screen: EuchreTableScreen as ComponentType<never>,
    view: EUCHRE_VIEW,
    eyebrow: 'Euchre',
    playfield: 'Euchre table',
    feltMark: 'E',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Dealing the first hand…',
    dealState: true,
    gameText: 'euchre',
  },
  {
    name: 'gin',
    Screen: GinTableScreen as ComponentType<never>,
    view: GIN_VIEW,
    eyebrow: 'Gin',
    playfield: 'Gin table',
    feltMark: '♣',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Shuffling up…',
    dealState: true,
    gameText: 'gin',
  },
  {
    name: 'hearts',
    Screen: HeartsTableScreen as ComponentType<never>,
    view: HEARTS_VIEW,
    eyebrow: 'Hearts',
    playfield: 'Hearts table',
    feltMark: '♥',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Shuffling up…',
    dealState: true,
    gameText: 'hearts',
  },
  {
    name: 'president',
    Screen: PresidentTableScreen as ComponentType<never>,
    view: PRESIDENT_VIEW,
    eyebrow: 'President',
    playfield: 'President table',
    feltMark: '♛',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Cutting the deck…',
    dealState: true,
    gameText: 'president',
  },
  {
    name: 'ratscrew',
    Screen: RatscrewTableScreen as ComponentType<never>,
    view: RATSCREW_VIEW,
    eyebrow: 'Rat Screw',
    playfield: 'Rat Screw table',
    feltMark: '♣',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Shuffling the stacks…',
    dealState: false,
    gameText: 'ratscrew',
  },
  {
    name: 'wild',
    Screen: WildTableScreen as ComponentType<never>,
    view: WILD_VIEW,
    eyebrow: 'Wild',
    playfield: 'Wild table',
    feltMark: 'W',
    errorHeadline: 'The table lost the thread.',
    loadingCopy: 'Shuffling the pile…',
    dealState: true,
    gameText: 'wild',
  },
];

type GameWindow = Window & { render_game_to_text?: () => string };

describe('table shell contract across every shipped screen', () => {
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
    delete (window as GameWindow).render_game_to_text;
  });

  const render = (entry: ScreenCase, props: Record<string, unknown>) =>
    act(() => root.render(createElement(entry.Screen, props as never)));

  it.each(SCREENS.map((entry) => [entry.name, entry] as const))(
    '%s keeps the shared root, HUD and menu chassis',
    (_name, entry) => {
      render(entry, { view: entry.view, fx: [], fxKey: 0 });

      const main = container.querySelector<HTMLElement>('main[data-table-screen]');
      expect(main).not.toBeNull();
      expect(main!.classList.contains(tableStyles.screen!)).toBe(true);
      // Rat Screw has no deal sequence, so it must not publish a deal state.
      expect(main!.hasAttribute('data-deal-state')).toBe(false);

      const header = main!.querySelector<HTMLElement>(`header.${tableStyles.hud}`);
      expect(header).not.toBeNull();
      expect(header!.querySelector(`.${tableStyles.eyebrow}`)!.textContent).toBe(entry.eyebrow);

      const menuButton = header!.querySelector<HTMLButtonElement>(
        'button[aria-label="Table menu"]',
      );
      expect(menuButton).not.toBeNull();
      expect(menuButton!.getAttribute('aria-haspopup')).toBe('dialog');
      expect(menuButton!.textContent).toBe('•••');
      // The menu button is always the header's last child, after the game cluster.
      expect(header!.lastElementChild).toBe(menuButton);

      const playfield = main!.querySelector<HTMLElement>(`section.${tableStyles.playfield}`);
      expect(playfield).not.toBeNull();
      expect(playfield!.getAttribute('aria-label')).toBe(entry.playfield);

      const feltMark = playfield!.querySelector<HTMLElement>(`.${tableStyles.feltMark}`);
      if (entry.feltMark === null) {
        expect(feltMark).toBeNull();
      } else {
        expect(feltMark!.textContent).toBe(entry.feltMark);
        expect(feltMark!.getAttribute('aria-hidden')).toBe('true');
      }
    },
  );

  it.each(SCREENS.map((entry) => [entry.name, entry] as const))(
    '%s tracks the deal on the root and the hand rail together',
    (_name, entry) => {
      const dealFx: FxEvent[] = [
        {
          kind: Fx.DealCard,
          payload: { card: 'S1', from: 'stock', to: 'hand:0', dur: 220 },
          at: 0,
        },
      ];
      render(entry, { view: entry.view, fx: dealFx, fxKey: 'deal' });

      const main = container.querySelector<HTMLElement>('main[data-table-screen]')!;
      const rail = container.querySelector<HTMLElement>(`.${tableStyles.localHand}`);

      if (!entry.dealState) {
        // Rat Screw's stacks never present a deal, so neither surface claims one.
        expect(main.hasAttribute('data-deal-state')).toBe(false);
        expect(rail).toBeNull();
        return;
      }

      expect(main.getAttribute('data-deal-state')).toBe('dealing');
      // The rail and the root must agree — they read the same presentation.
      expect(rail!.getAttribute('data-deal-state')).toBe('dealing');
    },
  );

  it.each(SCREENS.map((entry) => [entry.name, entry] as const))(
    '%s opens the shared menu and only quits once confirmed',
    (_name, entry) => {
      const onQuit = vi.fn();
      render(entry, { view: entry.view, fx: [], fxKey: 0, onQuit });

      expect(container.querySelector('[data-testid="table-menu"]')).toBeNull();

      act(() =>
        container.querySelector<HTMLButtonElement>('button[aria-label="Table menu"]')!.click(),
      );
      expect(container.querySelector('[data-testid="table-menu"]')).not.toBeNull();

      act(() =>
        container.querySelector<HTMLButtonElement>('[data-testid="quit-to-menu"]')!.click(),
      );
      expect(onQuit).not.toHaveBeenCalled();

      act(() =>
        container.querySelector<HTMLButtonElement>('[data-testid="confirm-quit"]')!.click(),
      );
      expect(onQuit).toHaveBeenCalledTimes(1);
      // Quitting closes the sheet before the route changes.
      expect(container.querySelector('[data-testid="table-menu"]')).toBeNull();
    },
  );

  it.each(SCREENS.map((entry) => [entry.name, entry] as const))(
    '%s keeps its own error and loading copy on the shared status panel',
    (_name, entry) => {
      render(entry, { view: null, fx: [], fxKey: 0, error: 'transport died' });

      const alert = container.querySelector<HTMLElement>('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert!.classList.contains(tableStyles.statusPanel!)).toBe(true);
      expect(alert!.querySelector('strong')!.textContent).toBe(entry.errorHeadline);
      expect(alert!.querySelector('span')!.textContent).toBe('transport died');

      render(entry, { view: null, fx: [], fxKey: 0 });

      const busy = container.querySelector<HTMLElement>('main[aria-busy="true"]');
      expect(busy).not.toBeNull();
      expect(busy!.querySelector(`.${tableStyles.loadingPip}`)).not.toBeNull();
      expect(busy!.querySelector('strong')!.textContent).toBe(entry.loadingCopy);
    },
  );

  it.each(SCREENS.map((entry) => [entry.name, entry] as const))(
    '%s publishes a live render_game_to_text surface and removes it on unmount',
    (_name, entry) => {
      render(entry, { view: entry.view, fx: [], fxKey: 0 });

      const surface = (window as GameWindow).render_game_to_text;
      expect(typeof surface).toBe('function');
      const first = JSON.parse(surface!()) as { game: string; status: string; error: unknown };
      expect(first.game).toBe(entry.gameText);
      expect(first.status).toBe('ready');
      expect(first.error).toBeFalsy();

      // The surface must follow the latest render, not the one that installed it.
      render(entry, { view: null, fx: [], fxKey: 0, error: 'transport died' });
      const second = JSON.parse((window as GameWindow).render_game_to_text!()) as {
        status: string;
        error: string;
      };
      expect(second.status).toBe('error');
      expect(second.error).toBe('transport died');

      act(() => root.unmount());
      expect((window as GameWindow).render_game_to_text).toBeUndefined();
      root = createRoot(container);
    },
  );
});
