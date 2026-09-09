import { act } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArrivalProvider,
  FxWaitingProvider,
  fanOpenAtMs,
  inboundArrivalCues,
  outboundDepartureCues,
  useAdmittedHand,
  useCardArriving,
} from './arrival-presentation';
import { FX_TIMING } from './fx-motion';

function Probe({ cardId, hand }: { cardId: string; hand?: readonly string[] }) {
  const arriving = useCardArriving(cardId);
  const admitted = useAdmittedHand(hand ?? [cardId]);
  return (
    <span
      data-arriving={arriving ? 'true' : 'false'}
      data-admitted={admitted.includes(cardId) ? 'true' : 'false'}
    />
  );
}

describe('inboundArrivalCues', () => {
  it('keeps draw and hand-to-hand flights, and ignores pile landings', () => {
    expect(
      inboundArrivalCues([
        { kind: Fx.DrawCard, payload: { card: 'S9', seat: 0, from: 'stock' }, at: 40 },
        {
          kind: 'wildpile.transfer',
          payload: { card: 'red-7-0', from: 'hand:1', to: 'hand:0' },
          at: 80,
        },
        { kind: Fx.DiscardCard, payload: { card: 'H4', seat: 0 }, at: 120 },
        { kind: Fx.DealCard, payload: { card: 'D3', from: 'stock', to: 'hand:0' }, at: 0 },
      ]).map((cue) => cue.card),
    ).toEqual(['S9', 'red-7-0']);
  });
});

describe('outboundDepartureCues', () => {
  it('keeps hand-to-pile plays and ignores deals', () => {
    expect(
      outboundDepartureCues([
        { kind: Fx.DiscardCard, payload: { card: 'H4', seat: 0 }, at: 0 },
        { kind: Fx.DealCard, payload: { card: 'D3', from: 'stock', to: 'hand:0' }, at: 0 },
        { kind: Fx.DrawCard, payload: { card: 'S9', seat: 0, from: 'stock' }, at: 40 },
      ]).map((cue) => cue.card),
    ).toEqual(['H4']);
  });

  it('ignores another seat’s discard when scoped to the local hand', () => {
    expect(
      outboundDepartureCues(
        [
          { kind: Fx.DiscardCard, payload: { card: 'H4', seat: 1 }, at: 0 },
          { kind: Fx.DiscardCard, payload: { card: 'C4', seat: 0 }, at: 0 },
        ],
        0,
      ).map((cue) => cue.card),
    ).toEqual(['C4']);
  });
});

describe('ArrivalProvider', () => {
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

  it('holds the fan closed until the flight is close, then hands off on landing', () => {
    vi.useFakeTimers();
    const cue = { startMs: 30, durationMs: FX_TIMING.drawFlightMs };
    act(() => {
      root.render(
        <ArrivalProvider
          fx={[{ kind: Fx.DrawCard, payload: { card: 'C4', seat: 0, from: 'stock' }, at: 30 }]}
          fxKey={'draw'}
        >
          <Probe cardId="C4" hand={['H1', 'C4']} />
        </ArrivalProvider>,
      );
    });

    const node = () => container.querySelector('span');
    expect(node()?.getAttribute('data-arriving')).toBe('true');
    expect(node()?.getAttribute('data-admitted')).toBe('false');

    act(() => void vi.advanceTimersByTime(fanOpenAtMs(cue) - 1));
    expect(node()?.getAttribute('data-admitted')).toBe('false');

    act(() => void vi.advanceTimersByTime(1));
    expect(node()?.getAttribute('data-admitted')).toBe('true');
    expect(node()?.getAttribute('data-arriving')).toBe('true');

    act(() => void vi.advanceTimersByTime(cue.startMs + cue.durationMs - fanOpenAtMs(cue) - 1));
    expect(node()?.getAttribute('data-arriving')).toBe('true');

    act(() => void vi.advanceTimersByTime(1));
    expect(node()?.getAttribute('data-arriving')).toBe('false');
    expect(node()?.getAttribute('data-admitted')).toBe('true');
  });

  it('keeps a discarded card in its fan slot until the flight leaves', () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        <ArrivalProvider fx={[]} fxKey={'idle'}>
          <Probe cardId="C4" hand={['H1', 'C4', 'D3']} />
        </ArrivalProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('true');

    act(() => {
      root.render(
        <ArrivalProvider
          fx={[{ kind: Fx.DiscardCard, payload: { card: 'C4', seat: 0 }, at: 0 }]}
          fxKey={'discard'}
        >
          <Probe cardId="C4" hand={['H1', 'D3']} />
        </ArrivalProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('true');

    act(() => void vi.advanceTimersByTime(0));
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('false');
  });

  /*
   * A room publishes game state the moment a packet lands and queues the
   * animation behind whatever is still in the air. Reported on a forced pickup
   * in Wild: the cards blinked into the fan, vanished, and then flew in.
   */
  it('holds a card whose flight is still queued behind another burst', () => {
    vi.useFakeTimers();
    const draw = [
      { kind: Fx.DrawCard, payload: { card: 'C4', seat: 0, from: 'stock' }, at: 0 },
    ] as const;

    // The pickup has been applied — the hand already holds C4 — but its burst
    // is still waiting behind the card someone else is playing.
    act(() => {
      root.render(
        <FxWaitingProvider fx={draw}>
          <ArrivalProvider
            fx={[{ kind: Fx.DiscardCard, payload: { card: 'S2', seat: 1 }, at: 0 }]}
            fxKey={'their-play'}
            localSeat={0}
          >
            <Probe cardId="C4" hand={['H1', 'C4']} />
          </ArrivalProvider>
        </FxWaitingProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('false');

    // Now the pickup goes on screen and its own cue takes the hold over.
    act(() => {
      root.render(
        <FxWaitingProvider fx={[]}>
          <ArrivalProvider fx={draw} fxKey={'my-draw'} localSeat={0}>
            <Probe cardId="C4" hand={['H1', 'C4']} />
          </ArrivalProvider>
        </FxWaitingProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('false');

    act(() => void vi.advanceTimersByTime(FX_TIMING.drawFlightMs));
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('true');
  });

  /*
   * The hold is inbound only, and deliberately so. Holding a PLAYED card in
   * the fan until its queued flight leaves is the tempting mirror image, but
   * the failure modes are not mirrored: a withheld arrival shows up a beat
   * late, while a held departure strands a card the game state says is gone.
   * It took the veiled friend-room suite from a 2-in-6 flake to 7-in-8.
   */
  it('does not keep a played card in the fan while its flight is queued', () => {
    vi.useFakeTimers();
    const play = [{ kind: Fx.DiscardCard, payload: { card: 'C4', seat: 0 }, at: 0 }] as const;
    act(() => {
      root.render(
        <FxWaitingProvider fx={[]}>
          <ArrivalProvider fx={[]} fxKey={'idle'} localSeat={0}>
            <Probe cardId="C4" hand={['H1', 'C4']} />
          </ArrivalProvider>
        </FxWaitingProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('true');

    // The play has been applied — C4 is out of the hand — and its burst is
    // still queued behind someone else's card.
    act(() => {
      root.render(
        <FxWaitingProvider fx={play}>
          <ArrivalProvider fx={[]} fxKey={'idle'} localSeat={0}>
            <Probe cardId="C4" hand={['H1']} />
          </ArrivalProvider>
        </FxWaitingProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('false');
  });

  it('does not park another seat’s discard in the local fan', () => {
    act(() => {
      root.render(
        <ArrivalProvider fx={[]} fxKey={'idle'} localSeat={0}>
          <Probe cardId="H4" hand={['C4', 'D3']} />
        </ArrivalProvider>,
      );
    });
    act(() => {
      root.render(
        <ArrivalProvider
          fx={[{ kind: Fx.DiscardCard, payload: { card: 'H4', seat: 1 }, at: 0 }]}
          fxKey={'opp-discard'}
          localSeat={0}
        >
          <Probe cardId="H4" hand={['C4', 'D3']} />
        </ArrivalProvider>,
      );
    });
    expect(container.querySelector('span')?.getAttribute('data-admitted')).toBe('false');
  });
});
