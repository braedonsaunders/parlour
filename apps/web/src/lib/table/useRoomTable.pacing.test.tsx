import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fx, type GameSession, type RuleValues } from '@parlour/engine';
import type {
  MultiplayerRoomSession,
  MultiplayerRoomSnapshot,
} from '@/app/_multiplayer/roomSession';
import { useRoomTable } from './useRoomTable';

function roomWith(
  snapshot: MultiplayerRoomSnapshot,
  send: (move: string) => void = () => {},
): MultiplayerRoomSession {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    send,
  } as unknown as MultiplayerRoomSession;
}

function Probe({ room }: { room: MultiplayerRoomSession }) {
  const { dispatch, race, session } = useRoomTable(room, 'wildpile');
  return createElement('div', null, [
    createElement(
      'button',
      { key: 'turn', 'data-testid': 'turn', onClick: () => dispatch('draw') },
      session?.phase.actor ?? 'waiting',
    ),
    createElement(
      'button',
      { key: 'race', 'data-testid': 'race', onClick: () => race('catchLastCard') },
      'catch',
    ),
  ]);
}

describe('friend-table action pacing', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  /** A table mid-handoff: seat 0's card is still landing, seat 1 is up next. */
  function holdingSnapshot(): MultiplayerRoomSnapshot {
    const session = {
      seed: 42,
      status: 'playing',
      phase: { phase: 'play', actor: 1, round: 0 },
      log: [{ seq: 0, seat: 0, move: 'playCard' }],
    } as unknown as GameSession<unknown, RuleValues>;
    return {
      gameId: 'wildpile',
      session,
      fxKey: 1,
      fx: [{ kind: Fx.DiscardCard, payload: { card: 'red-7', seat: 0 } }],
      localSeat: 1,
      error: null,
      security: { paused: null },
    } as unknown as MultiplayerRoomSnapshot;
  }

  const click = (testId: string) =>
    act(() => host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click());

  it('withholds the next human turn until the card lands and its read beat passes', () => {
    const root = createRoot(host);
    const send = vi.fn();

    act(() => root.render(createElement(Probe, { room: roomWith(holdingSnapshot(), send) })));
    expect(host.querySelector('[data-testid="turn"]')?.textContent).toBe('waiting');
    click('turn');
    expect(send).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(859));
    expect(host.querySelector('[data-testid="turn"]')?.textContent).toBe('waiting');

    act(() => vi.advanceTimersByTime(1));
    expect(host.querySelector('[data-testid="turn"]')?.textContent).toBe('1');
    expect(send).toHaveBeenCalledWith('draw', undefined, undefined);

    act(() => root.unmount());
  });

  /*
   * Reported from a friend room: "I clicked Catch you and nothing happened."
   * The catch window is about a second wide and the hold is about as long, so
   * the tap was still sitting in the queue when the window shut — and a move
   * that arrives late is refused as a stale tap and swallowed, which looks
   * precisely like a dead button. A race is not a turn and does not wait.
   */
  it('sends a race the instant it is tapped, hold or no hold', () => {
    const root = createRoot(host);
    const send = vi.fn();

    act(() => root.render(createElement(Probe, { room: roomWith(holdingSnapshot(), send) })));
    click('race');

    expect(send).toHaveBeenCalledWith('catchLastCard', undefined, undefined);
    // Still holding this seat's own controls: only the shout jumped the queue.
    expect(host.querySelector('[data-testid="turn"]')?.textContent).toBe('waiting');

    act(() => root.unmount());
  });
});
