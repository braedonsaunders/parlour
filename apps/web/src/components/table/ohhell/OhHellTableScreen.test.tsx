import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ohhellTableView } from '@/lib/ohhell/view';
import { OhHellTransport } from '@/lib/solo/OhHellTransport';
import { DEFAULT_PROFILE_SETTINGS, useProfileStore } from '@/stores/profile';
import { OhHellTableScreen } from './OhHellTableScreen';

const OHHELL_STYLES = readFileSync(join(process.cwd(), 'src/styles/ohhell.module.css'), 'utf8');
const SEAT_PLATE = readFileSync(
  join(process.cwd(), 'src/components/table/shell/SeatPlate.tsx'),
  'utf8',
);

let container: HTMLDivElement;
let root: Root;

function table(seats = 4, mode: 'classic' | 'quick' | 'wizard' = 'quick') {
  const transport = new OhHellTransport({
    mode,
    seats,
    seed: 20260824,
    player: { name: 'You', avatarId: 'ember' },
    botTier: 2,
  });
  return transport;
}

function viewOf(transport: OhHellTransport) {
  return ohhellTableView(transport.getSnapshot(), transport.legalMovesForSeat(0));
}

function render(
  view: ReturnType<typeof ohhellTableView> | null,
  props: Record<string, unknown> = {},
) {
  act(() =>
    root.render(createElement(OhHellTableScreen, { view, fx: [], fxKey: 'ready', ...props })),
  );
}

/** Runs the table forward until seat 0 owes the given kind of decision. */
function advanceTo(transport: OhHellTransport, decision: 'bid' | 'play') {
  for (let step = 0; step < 400; step++) {
    const view = viewOf(transport);
    if (view.decision === decision) return view;
    if (transport.getSnapshot().status === 'round-over') {
      transport.startNextRound();
      continue;
    }
    const legal = transport.legalMovesForSeat(0);
    if (legal.length > 0) transport.dispatch(legal[0]!.id, legal[0]!.payload);
    else transport.playBotTurn();
  }
  throw new Error(`never reached a ${decision} decision`);
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  useProfileStore.setState((state) => ({ ...state, settings: { ...DEFAULT_PROFILE_SETTINGS } }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('OhHellTableScreen', () => {
  it('shows a loading table before the deal', () => {
    render(null);
    expect(container.textContent).toContain('Turning a card for trump');
  });

  it('surfaces an error instead of a board', () => {
    render(null, { error: 'the relay dropped' });
    expect(container.textContent).toContain('the relay dropped');
    expect(container.querySelector('[data-testid="ohhell-board"]')).toBeNull();
  });

  it('draws a seat row for every player at any seat count', () => {
    for (const seats of [3, 5, 7]) {
      render(viewOf(table(seats)));
      // Every seat but the local one gets a plate; the local seat sits under
      // the hand rail instead.
      expect(container.querySelectorAll('[data-testid^="ohhell-seat-"]')).toHaveLength(seats);
    }
  });

  it('offers the whole bid dial, and never the hooked value', () => {
    const transport = table();
    const view = advanceTo(transport, 'bid');
    render(view);
    const buttons = [...container.querySelectorAll('[data-testid^="ohhell-bid-"]')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.map((button) => Number(button.textContent))).toEqual([...view.bidOptions]);
    if (view.forbiddenBid !== null) {
      expect(view.bidOptions).not.toContain(view.forbiddenBid);
      expect(container.textContent).toContain('hooked');
    }
  });

  it('reports the running contract against the tricks available', () => {
    const transport = table();
    const view = advanceTo(transport, 'bid');
    render(view);
    const contract = container.querySelector('[data-testid="ohhell-contract"]')!;
    expect(contract.textContent).toContain(String(view.bidTotal));
    expect(contract.textContent).toContain(String(view.handSize));
  });

  it('only lets the player click a card the rules allow', () => {
    const transport = table();
    const view = advanceTo(transport, 'play');
    const played: string[] = [];
    render(view, { onPlay: (card: string) => played.push(card) });

    const cards = [...container.querySelectorAll<HTMLElement>('[data-hand-card]')];
    expect(cards.length).toBe(view.hand.length);
    for (const card of cards) {
      const id = card.dataset.cardId!;
      const button = card.querySelector<HTMLButtonElement>('button');
      // A card outside the legal set must be unclickable, not merely ignored —
      // an enabled button that does nothing reads as a broken table.
      expect(button?.disabled ?? true).toBe(!view.playable.includes(id));
    }

    const legalCard = cards.find((card) => view.playable.includes(card.dataset.cardId!))!;
    act(() => legalCard.querySelector<HTMLButtonElement>('button')!.click());
    expect(played).toEqual([view.playable.find((card) => card === played[0]) ?? played[0]]);
    expect(view.playable).toContain(played[0]);
  });

  it('says "no trump" rather than drawing a card that is not there', () => {
    const transport = table();
    const view = viewOf(transport);
    render({ ...view, trumpCard: null, trumpSuit: null });
    const trump = container.querySelector('[data-testid="ohhell-trump"]')!;
    expect(trump.textContent).toContain('no');
    expect(trump.querySelector('[data-card-chassis]')).toBeNull();
  });

  it('marks each seat exact, under or over against its bid', () => {
    const transport = table();
    const view = advanceTo(transport, 'play');
    const seats = view.seats.map((seat, index) =>
      index === 0
        ? { ...seat, bid: 2, tricksWon: 2, standing: 'exact' as const }
        : { ...seat, bid: 1, tricksWon: 3, standing: 'over' as const },
    );
    render({ ...view, seats });
    const local = container.querySelector('[data-testid="ohhell-seat-0"]')!;
    expect(local.getAttribute('data-standing')).toBe('exact');
    for (const seat of seats.slice(1)) {
      expect(
        container
          .querySelector(`[data-testid="ohhell-seat-${seat.seat}"]`)!
          .getAttribute('data-standing'),
      ).toBe('over');
    }
  });

  it('offers the next round only once the current one is scored', () => {
    const transport = table();
    const view = viewOf(transport);
    render(view);
    expect(container.querySelector('[data-testid="ohhell-round-end"]')).toBeNull();
    render({ ...view, roundOver: true, matchOver: false });
    expect(container.querySelector('[data-testid="ohhell-round-end"]')).not.toBeNull();
    // A finished match hands over to the podium, so the table must not offer
    // another round on top of it.
    render({ ...view, roundOver: true, matchOver: true });
    expect(container.querySelector('[data-testid="ohhell-round-end"]')).toBeNull();
  });

  /*
   * Layout contract.
   *
   * jsdom has no layout engine, so these assert the structural facts that
   * decided the geometry — every one of them was a real defect first. The
   * measurements themselves came from driving a real browser at 390x844
   * through 1280x800 at three, four, five, six and seven seats.
   */
  describe('seating layout', () => {
    it('positions the seat so the shared card fan cannot escape it', () => {
      // `.opponentCards` paints with `position: absolute`. A seat that is not
      // itself positioned sends every fan to the nearest positioned ancestor,
      // which stacked all of them in one place at the top of the felt.
      const seat = /\.seat \{([^}]*)\}/.exec(OHHELL_STYLES)?.[1] ?? '';
      expect(seat).toContain('position: relative');
      // The shared nameplate paints its pill from these; a seat that does not
      // declare them renders an unreadable plate.
      expect(seat).toContain('--seat-accent');
      expect(seat).toContain('--seat-shade');
    });

    it('opts the fan out of absolute positioning through a stable hook', () => {
      // `styles.opponentCards` is a hashed CSS-module class, so this stylesheet
      // cannot name it — the same trap that left three Klondike rules dead.
      expect(SEAT_PLATE).toContain('data-opponent-fan');
      expect(OHHELL_STYLES).toContain('.seat [data-opponent-fan]');
      expect(OHHELL_STYLES).not.toContain(':global(.opponentCards)');
    });

    it('lays the board out as a grid rather than at magic percentages', () => {
      // Seats / centre / rail / local plate are grid rows, so the trump card
      // cannot be placed behind a seat row that wrapped, and the bid rail
      // cannot be placed on top of the player's own plate.
      const board = /\.board \{([^}]*)\}/.exec(OHHELL_STYLES)?.[1] ?? '';
      expect(board).toContain('display: grid');
      expect(board).toContain('grid-template-rows: auto 1fr auto auto');
      expect(board).toContain('padding:');
    });

    it('keeps every region inside the playfield', () => {
      // `.screen` is not a flow container and the playfield is the only box
      // with `inset: 0`. A region rendered as a sibling of the playfield stacks
      // at the top of the screen — which is exactly how the hand rail, the
      // local plate and the bid rail ended up piled on the seats.
      const { transport } = { transport: table() };
      render(viewOf(transport));
      const playfield = container.querySelector('section[aria-label="Oh Hell table"]')!;
      for (const sel of [
        '[data-testid="ohhell-board"]',
        '[data-zone^="hand:"]',
        '[data-testid="ohhell-seat-0"]',
      ]) {
        expect(playfield.querySelector(sel), sel).not.toBeNull();
      }
    });

    it('fits the pip row inside the plate it belongs to', () => {
      // Three fixed-width chips ran wider than the seat, so adjacent seats'
      // numbers collided even though the plates themselves did not.
      const pips = /\.pips \{([^}]*)\}/.exec(OHHELL_STYLES)?.[1] ?? '';
      expect(pips).toContain('width: 100%');
      const pipSpan = /\.pips span \{([^}]*)\}/.exec(OHHELL_STYLES)?.[1] ?? '';
      expect(pipSpan).toContain('min-width: 0');
      expect(pipSpan).toContain('flex: 1 1 0');
    });
  });
});
