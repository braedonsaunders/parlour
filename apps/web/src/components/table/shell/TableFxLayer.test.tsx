import { act, useRef, type ReactNode } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EuchreTableView } from '@/lib/euchre/view';
import type { FxCue } from '@/lib/table/fx-motion';
import tableStyles from '@/styles/table.module.css';
import { PlayingCard } from '../PlayingCard';
import { EuchreTableScreen } from '../euchre/EuchreTableScreen';
import { TableCardFlight, TableFxLayer, TableTurnPop } from './TableFxLayer';
import { TableShell } from './TableShell';

const GOOD_FX: FxEvent[] = [
  { kind: Fx.DealCard, payload: { card: 'S1', from: 'stock', to: 'hand:0', dur: 220 }, at: 0 },
  { kind: Fx.FlipCard, payload: { card: 'H5', from: 'stock', to: 'discard', dur: 220 }, at: 260 },
];

/** A deal cue with no destination zone: the planner rejects it outright. */
const BAD_FX: FxEvent[] = [
  { kind: Fx.DealCard, payload: { card: 'S1', from: 'stock', to: '', dur: 220 }, at: 0 },
];

const NARRATED_FX: FxEvent[] = [
  { kind: 'tricks.play', payload: { card: 'H5', seat: 1, index: 0 }, at: 0 },
  { kind: 'eights.score', payload: { seat: 1, points: 10, total: 25 }, at: 80 },
  { kind: Fx.TurnRing, payload: { seat: 2 }, at: 120 },
];

function Harness({
  fx,
  renderCue,
  presentation,
  reduced,
  children,
}: {
  fx: readonly FxEvent[];
  renderCue: (cue: FxCue) => ReactNode;
  presentation?: 'live' | 'hidden';
  reduced?: boolean;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLElement>(null);
  return (
    <TableShell rootRef={rootRef}>
      <TableFxLayer
        fx={fx}
        fxKey="k"
        rootRef={rootRef}
        renderCue={renderCue}
        presentation={presentation}
        reduced={reduced}
      >
        {children}
      </TableFxLayer>
    </TableShell>
  );
}

describe('TableFxLayer', () => {
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

  const renderFlights = (cue: FxCue) => {
    if (cue.type === 'deal' || cue.type === 'flip') {
      return (
        <TableCardFlight cueId={cue.id}>
          <PlayingCard faceDown />
        </TableCardFlight>
      );
    }
    if (cue.type === 'turn') return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
    return null;
  };

  it('paints the flight chassis every table shares', () => {
    act(() => root.render(<Harness fx={GOOD_FX} renderCue={renderFlights} />));

    const layer = container.querySelector<HTMLElement>(`.${tableStyles.fxLayer}`)!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.hasAttribute('aria-live')).toBe(false);
    expect(layer.querySelector(`.${tableStyles.fxError}`)).toBeNull();

    const flights = [...layer.querySelectorAll<HTMLElement>('[data-card-flight]')];
    expect(flights).toHaveLength(2);
    for (const flight of flights) {
      expect(flight.classList.contains(tableStyles.flyingCard!)).toBe(true);
      expect(flight.getAttribute('data-fx-cue')).toBeTruthy();
      // The animation hook drives these three children by class and attribute.
      expect(flight.querySelector(`.${tableStyles.cardTrail}`)).not.toBeNull();
      expect(flight.querySelector('[data-flight-card]')).not.toBeNull();
      expect(flight.querySelector(`.${tableStyles.cardGlint}`)).not.toBeNull();
    }
  });

  it('marks a decorative layer aria-hidden rather than announcing it twice', () => {
    act(() =>
      root.render(<Harness fx={GOOD_FX} renderCue={renderFlights} presentation="hidden" />),
    );

    const layer = container.querySelector<HTMLElement>(`.${tableStyles.fxLayer}`)!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.hasAttribute('aria-live')).toBe(false);
  });

  it('announces a terse action, score change and turn from the fx timeline', () => {
    act(() => root.render(<Harness fx={NARRATED_FX} renderCue={renderFlights} />));

    const announcer = container.querySelector<HTMLElement>('[data-table-announcer]')!;
    expect(announcer.getAttribute('aria-live')).toBe('polite');
    expect(announcer.getAttribute('aria-atomic')).toBe('true');
    expect(announcer.textContent).toBe(
      'Seat 2 played H5. Seat 2 now has 25 points. Seat 3’s turn.',
    );
  });

  it('does not narrate setup flights, even when calm motion skips their travel', () => {
    act(() => root.render(<Harness fx={GOOD_FX} renderCue={renderFlights} reduced />));

    expect(container.querySelector('[data-table-announcer]')?.textContent).toBe('');
  });

  it('contains a malformed batch: no flights, a skipped note, and extra children survive', () => {
    act(() =>
      root.render(
        <Harness fx={BAD_FX} renderCue={renderFlights}>
          <i data-game-moment />
        </Harness>,
      ),
    );

    const layer = container.querySelector<HTMLElement>(`.${tableStyles.fxLayer}`)!;
    expect(layer.querySelectorAll('[data-card-flight]')).toHaveLength(0);
    expect(layer.querySelector(`.${tableStyles.fxError}`)!.textContent).toMatch(
      /^Animation skipped: /,
    );
    expect(layer.querySelector('[data-game-moment]')).not.toBeNull();
  });
});

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

describe('Euchre shared cue layer', () => {
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

  it('keeps its decorative shared flights on a well-formed batch', () => {
    act(() => root.render(<EuchreTableScreen view={EUCHRE_VIEW} fx={GOOD_FX} fxKey="good" />));

    const hidden = [...container.querySelectorAll<HTMLElement>(`.${tableStyles.fxLayer}`)].filter(
      (layer) => layer.getAttribute('aria-hidden') === 'true',
    );
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.some((layer) => layer.querySelector('[data-fx-cue]') !== null)).toBe(true);
    expect(container.querySelector('main[data-table-screen]')).not.toBeNull();
  });

  it('fails soft on a malformed batch instead of taking the table down', () => {
    act(() => root.render(<EuchreTableScreen view={EUCHRE_VIEW} fx={BAD_FX} fxKey="bad" />));

    // The felt, the HUD and the hand rail all survive the bad cue.
    expect(container.querySelector('main[data-table-screen]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Table menu"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-hand-card]')).toHaveLength(EUCHRE_VIEW.hand.length);
    expect(container.querySelector(`.${tableStyles.fxError}`)!.textContent).toMatch(
      /^Animation skipped: /,
    );
  });
});
