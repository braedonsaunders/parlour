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
  const { dispatch, session } = useRoomTable(room, 'wildpile');
  return createElement(
    'button',
    { onClick: () => dispatch('draw') },
    session?.phase.actor ?? 'waiting',
  );
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

  it('withholds the next human turn until the card lands and its read beat passes', () => {
    const session = {
      seed: 42,
      status: 'playing',
      phase: { phase: 'play', actor: 1, round: 0 },
      log: [{ seq: 0, seat: 0, move: 'playCard' }],
    } as unknown as GameSession<unknown, RuleValues>;
    const snapshot = {
      gameId: 'wildpile',
      session,
      fxKey: 1,
      fx: [{ kind: Fx.DiscardCard, payload: { card: 'red-7', seat: 0 } }],
      localSeat: 1,
      error: null,
      security: { paused: null },
    } as unknown as MultiplayerRoomSnapshot;
    const root = createRoot(host);
    const send = vi.fn();

    act(() => root.render(createElement(Probe, { room: roomWith(snapshot, send) })));
    expect(host.textContent).toBe('waiting');
    act(() => host.querySelector('button')!.click());
    expect(send).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(859));
    expect(host.textContent).toBe('waiting');

    act(() => vi.advanceTimersByTime(1));
    expect(host.textContent).toBe('1');
    expect(send).toHaveBeenCalledWith('draw', undefined, undefined);

    act(() => root.unmount());
  });
});
