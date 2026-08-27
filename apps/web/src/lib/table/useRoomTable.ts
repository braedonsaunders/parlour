'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import type { GameSession, RuleValues } from '@parlour/engine';
import {
  clearActiveMultiplayerSession,
  expectedRoomGameId,
  getActiveMultiplayerSession,
  multiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
  type MultiplayerRoomSnapshot,
} from '@/app/_multiplayer/roomSession';
import { isSeatLeftFault } from '@/lib/multiplayer/veil';

/**
 * The friend-room half of a table page, written once.
 *
 * Each page repeated the same four things: subscribe to the room, narrow its
 * session to this game's types, wrap `room.send` in a try/catch that surfaces
 * the failure in the table's own error slot, and merge that local error with
 * the room's. The copies had already drifted — some reported a failed send as
 * "The move could not be sent.", others swallowed it — so this fixes the
 * wording in one place too.
 */

export interface RoomTable<S, C extends RuleValues> {
  snapshot: MultiplayerRoomSnapshot;
  /** null until this room is seated and playing this game */
  session: GameSession<S, C> | null;
  localSeat: number | null;
  /** the room's error, or a local send failure, whichever is live */
  error: string | null;
  /**
   * Sends a move. `reveals` carries the Veil openings a move makes public —
   * Wild's "discard everything of this colour" opens several cards at once —
   * and is ignored by open rooms.
   */
  dispatch(move: string, payload?: unknown, reveals?: readonly string[]): void;
  /** Leaves the room and clears it, so the shelf is not haunted by a dead table. */
  leave(go: () => void): void;
}

export const SEND_FAILED = 'The move could not be sent.';

/**
 * A refusal that means "the position moved", not "the table broke".
 *
 * The engine words these as `move <id> is not legal right now`
 * (runtime.ts `illegal-move`), and a duplicate is the same story told from the
 * other end: the move already landed. Both describe a tap that arrived a beat
 * late against a table that is otherwise perfectly healthy.
 */
export function isStaleMoveFault(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /is not legal right now/i.test(message) || /duplicate action/i.test(message);
}

export function useRoomTable<S, C extends RuleValues>(
  room: MultiplayerRoomSession,
  gameId: string,
): RoomTable<S, C> {
  const [localError, setLocalError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<S, C>(snapshot, gameId);

  const dispatch = useCallback(
    (move: string, payload?: unknown, reveals?: readonly string[]) => {
      try {
        room.send(move, payload, reveals);
        setLocalError(null);
      } catch (caught) {
        /*
         * A move the engine refuses is a stale tap, not a lost table.
         *
         * Every control is drawn from a snapshot, and on a real table the state
         * moves between the render and the thumb: a seat plays while you are
         * reaching for "Last card!", the turn passes, the button you are
         * looking at describes a position that no longer exists. The engine
         * correctly refuses, and this used to hand that refusal to the error
         * screen — so a mistimed tap on an optional, cost-free control replaced
         * a live game with "The table lost the thread."
         *
         * Nothing is lost. The authoritative state is intact and every peer
         * still agrees on it; the render that follows shows the position that
         * actually holds. Swallowing it is the honest response, and it is the
         * difference between a button that did nothing and a table that died.
         */
        if (isStaleMoveFault(caught)) return;
        setLocalError(caught instanceof Error ? caught.message : SEND_FAILED);
      }
    },
    [room],
  );

  const leave = useCallback(
    (go: () => void) => {
      room.close();
      clearActiveMultiplayerSession();
      go();
    },
    [room],
  );

  return {
    snapshot,
    session,
    localSeat: snapshot.localSeat,
    error: isSeatLeftFault(localError ?? snapshot.error) ? null : (localError ?? snapshot.error),
    dispatch,
    leave,
  };
}

/**
 * The room currently seated at this device, or null for a solo table.
 *
 * Table pages call this to decide which half of themselves to render. It is a
 * subscription rather than a read so that a room arriving (or closing) while
 * the page is mounted swaps the table under the player rather than stranding
 * them on the wrong one.
 */
export function useActiveRoom(gameId: string): MultiplayerRoomSession | null {
  const { room, snapshot } = useAnyActiveRoom();
  if (!snapshot || snapshot.connection === 'closed') return null;
  if (snapshot.gameId !== gameId && snapshot.settings?.gameId !== gameId) return null;
  return room;
}

/** The live room and its current snapshot, without narrowing to one game. */
export function useAnyActiveRoom(): {
  room: MultiplayerRoomSession | null;
  snapshot: MultiplayerRoomSnapshot | null;
} {
  const room = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  const snapshot = useSyncExternalStore(
    room?.subscribe ?? subscribeNoop,
    room?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return { room, snapshot };
}

function emptySnapshot(): MultiplayerRoomSnapshot | null {
  return null;
}

/**
 * True when this tab navigated here from a live room for `gameId`.
 *
 * Table pages must not boot a solo deal while this is set: that is how a phone
 * used to land on a different game after the join page handed off.
 */
export function useExpectedRoom(gameId: string): boolean {
  return useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    () => expectedRoomGameId() === gameId,
    () => false,
  );
}

const subscribeNoop = () => () => {};

/** False during SSR/hydration, true on the client snapshot that follows. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
