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
  const room = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  const snapshot = room?.getSnapshot();
  if (!snapshot || snapshot.gameId !== gameId || snapshot.connection === 'closed') return null;
  return room;
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
