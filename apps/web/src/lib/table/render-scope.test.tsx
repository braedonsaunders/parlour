import { act } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArrivalProvider,
  useAdmittedHand,
  useCardArriving,
  useCardDeparting,
  useFanReceiving,
} from './arrival-presentation';
import { DealProvider, useDealPhase, useDealVisibleCount } from './deal-presentation';
import { useWildPickupCount, wildPickup } from '../wild/pickup';

/**
 * Counts how far a six-card stacked pickup's timers blast. The topology
 * matches Wild: a table body, seven seats that do not read arrival, a fan
 * that admits cards, one rail card per admitted id, and a pickup chip.
 */
const PICKUP_CARDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'] as const;
const HELD = ['H1', 'H2', 'H3'] as const;
const SEAT_COUNT = 7;

function sixCardPickupFx(): FxEvent[] {
  const start = 0;
  const stagger = 80;
  return [
    { kind: 'wildpile.pickup', payload: { seat: 0, amount: 6, reason: 'penalty' }, at: start },
    ...PICKUP_CARDS.map((card, index) => ({
      kind: Fx.DrawCard,
      payload: { card, seat: 0, from: 'stock' },
      at: start + index * stagger,
    })),
  ];
}

function sevenSeatDealFx(): FxEvent[] {
  const events: FxEvent[] = [];
  let at = 0;
  for (let card = 0; card < 7; card++) {
    for (let seat = 0; seat < SEAT_COUNT; seat++) {
      events.push({
        kind: Fx.DealCard,
        payload: { card: `S${seat}C${card}`, from: 'stock', to: `hand:${seat}` },
        at,
      });
      at += 65;
    }
  }
  return events;
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

describe('six-card pickup render scope', () => {
  it('keeps table and idle seats still while only the fan, landing card and counter tick', () => {
    vi.useFakeTimers();
    const renders = {
      table: 0,
      seats: Array.from({ length: SEAT_COUNT }, () => 0),
      fan: 0,
      cards: {} as Record<string, number>,
      counter: 0,
    };
    const fx = sixCardPickupFx();
    const pickup = wildPickup(fx);
    const hand = [...HELD, ...PICKUP_CARDS];

    function Table() {
      renders.table += 1;
      return (
        <ArrivalProvider fx={fx} fxKey="pickup">
          {Array.from({ length: SEAT_COUNT }, (_, seat) => (
            <Seat key={seat} seat={seat} />
          ))}
          <Fan cards={hand} />
          <Counter />
        </ArrivalProvider>
      );
    }

    function Seat({ seat }: { seat: number }) {
      renders.seats[seat] = (renders.seats[seat] ?? 0) + 1;
      return <span data-seat={seat} />;
    }

    function Fan({ cards }: { cards: readonly string[] }) {
      const admitted = useAdmittedHand(cards);
      renders.fan += 1;
      return (
        <div data-fan-count={admitted.length}>
          {admitted.map((cardId) => (
            <Card key={cardId} cardId={cardId} />
          ))}
        </div>
      );
    }

    function Card({ cardId }: { cardId: string }) {
      renders.cards[cardId] = (renders.cards[cardId] ?? 0) + 1;
      const arriving = useCardArriving(cardId);
      const departing = useCardDeparting(cardId);
      const receiving = useFanReceiving();
      return (
        <span
          data-card={cardId}
          data-arriving={arriving || undefined}
          data-departing={departing || undefined}
          data-receiving={receiving || undefined}
        />
      );
    }

    function Counter() {
      const count = useWildPickupCount(pickup, 'pickup');
      renders.counter += 1;
      return <span data-taken={count?.taken} data-active={count ? 'true' : 'false'} />;
    }

    act(() => {
      root.render(<Table />);
    });

    const afterMount = snapshot(renders);
    flushTimersOneByOne();
    const afterBurst = snapshot(renders);

    const tableTicks = afterBurst.table - afterMount.table;
    const idleSeatTicks = afterBurst.seats
      .slice(1)
      .map((count, index) => count - afterMount.seats[index + 1]!);
    const fanTicks = afterBurst.fan - afterMount.fan;
    const counterTicks = afterBurst.counter - afterMount.counter;
    const heldCardTicks = HELD.map(
      (card) => (afterBurst.cards[card] ?? 0) - (afterMount.cards[card] ?? 0),
    );

    // Before this work a six-card pickup was ~12 arrival ticks + ~8 pickup
    // ticks, each re-rendering the whole table (7 seats, the fan, the counter).
    expect(tableTicks).toBe(0);
    expect(idleSeatTicks.every((ticks) => ticks === 0)).toBe(true);
    // Six fan-opens, each followed by the documented extra useAdmittedHand pass.
    expect(fanTicks).toBe(12);
    expect(counterTicks).toBe(8);
    // Held cards re-flow with the fan, plus once when receiving ends.
    for (const ticks of heldCardTicks) {
      expect(ticks).toBeLessThanOrEqual(fanTicks + 1);
    }
  });
});

describe('deal landing render scope', () => {
  it('re-renders only the seat whose card just landed, not the table or other seats', () => {
    vi.useFakeTimers();
    const renders = { table: 0, seats: Array.from({ length: SEAT_COUNT }, () => 0) };
    const fx = sevenSeatDealFx();

    function Table() {
      renders.table += 1;
      const phase = useDealPhase();
      return (
        <div data-dealing={phase.dealing || undefined}>
          {Array.from({ length: SEAT_COUNT }, (_, seat) => (
            <Seat key={seat} seat={seat} />
          ))}
        </div>
      );
    }

    function Seat({ seat }: { seat: number }) {
      const count = useDealVisibleCount(seat, 7);
      renders.seats[seat] = (renders.seats[seat] ?? 0) + 1;
      return <span data-seat={seat} data-count={count} />;
    }

    act(() => {
      root.render(
        <DealProvider fx={fx} fxKey="deal">
          <Table />
        </DealProvider>,
      );
    });

    const afterMount = snapshot(renders);
    act(() => void vi.advanceTimersByTime(220));
    const afterFirst = snapshot(renders);

    expect(afterFirst.table - afterMount.table).toBe(0);
    expect(afterFirst.seats[0]! - afterMount.seats[0]!).toBe(1);
    for (let seat = 1; seat < SEAT_COUNT; seat++) {
      expect(afterFirst.seats[seat]! - afterMount.seats[seat]!).toBe(0);
    }

    act(() => void vi.advanceTimersByTime(65));
    const afterSecond = snapshot(renders);
    expect(afterSecond.table - afterFirst.table).toBe(0);
    expect(afterSecond.seats[0]! - afterFirst.seats[0]!).toBe(0);
    expect(afterSecond.seats[1]! - afterFirst.seats[1]!).toBe(1);
  });
});

describe('pickup count isolation', () => {
  it('does not re-render a sibling when the running total advances', () => {
    vi.useFakeTimers();
    const renders = { sibling: 0, counter: 0 };
    const fx = sixCardPickupFx();
    const pickup = wildPickup(fx);

    function Sibling() {
      renders.sibling += 1;
      return <span data-sibling />;
    }

    function Counter() {
      const count = useWildPickupCount(pickup, 'pickup');
      renders.counter += 1;
      return <span data-taken={count?.taken} />;
    }

    function Tree() {
      return (
        <>
          <Sibling />
          <Counter />
        </>
      );
    }

    act(() => {
      root.render(<Tree />);
    });
    const afterMount = snapshot(renders);
    flushTimersOneByOne();
    expect(renders.sibling - afterMount.sibling).toBe(0);
    expect(renders.counter - afterMount.counter).toBe(8);
  });
});

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

/** Each timeout is its own task in the browser; advancing them all inside one
 *  `act` would batch every tick into a single render and hide the blast radius. */
function flushTimersOneByOne(): void {
  while (vi.getTimerCount() > 0) {
    act(() => {
      vi.advanceTimersToNextTimer();
    });
  }
}
