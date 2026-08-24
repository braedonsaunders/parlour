'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { MatchResult } from '@parlour/engine';
import type { GameId } from '@/lib/games';
import type { MultiplayerGameId } from '@/lib/rooms/gameIds';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import type { RecordedSeat } from '@/stores/history';
import { useMatchFlowStore, type MatchSnapshot } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import {
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  clearActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '@/app/_multiplayer/roomSession';

/**
 * The table-page runtime, written once.
 *
 * `useSoloTable` already removed the per-game copies of the solo *runtime* —
 * snapshot/fx/error state and the bot-turn timer. What it left behind was the
 * page *shell*, and nine copies of that shell were still 2,376 lines: the same
 * multiplayer probe, the same transport-in-a-timeout bootstrap, the same
 * try/catch around `room.send`, and the same forty-line match-end reporting
 * block written twice per page — once for solo, once for multiplayer.
 *
 * Those four things are here. Everything a page still contains after adopting
 * them is genuinely about its game: which view builder, which screen, which
 * handlers, which "did I win" predicate.
 *
 * Deliberately four small hooks rather than one `useGameTable(adapter)`. A
 * single hook would need an adapter object with a dozen callbacks covering
 * every game's divergence, which is the same complexity relocated — and the
 * codebase already prefers focused hooks (`useSoloTable`, `useTableMenu`,
 * `useGameTextSurface`). Pages compose these in five lines.
 */

// ---------------------------------------------------------------------------
// 1. Is there a live room for this game?
// ---------------------------------------------------------------------------

/**
 * The active multiplayer room, but only when it is playing `gameId`.
 *
 * Takes the ROOM id, which is not always the shelf id — Wild is `wildpile` to
 * the room layer and `wild` in the ledger. Every page opened with
 * `if (multiplayer?.getSnapshot().gameId === '<id>')`.
 * Getting that comparison wrong — or forgetting it — renders one game's table
 * against another game's session, which is the UI-side twin of the room
 * registry's old Blitz fallback.
 */
export function useMultiplayerRoom(gameId: MultiplayerGameId): MultiplayerRoomSession | null {
  const room = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  return room?.getSnapshot().gameId === gameId ? room : null;
}

// ---------------------------------------------------------------------------
// 2. Solo transport bootstrap
// ---------------------------------------------------------------------------

/**
 * Builds the solo transport on the client, after paint.
 *
 * The `setTimeout(0)` is not a stylistic tic and must not be "simplified" away.
 * A transport seeds itself from the wall clock, so constructing it during
 * render would differ between the server-rendered HTML and the first client
 * render and trip hydration. Deferring a tick also lets the table's first frame
 * paint before the deal is computed, which is what makes the opening cascade
 * feel like it starts from an empty table.
 *
 * `deps` are the setup values the transport is built from. Changing any of them
 * builds a new table, which is the intent — a different mode or bot tier is a
 * different game.
 */
export function useSoloTransport<T>(
  create: () => T,
  deps: readonly unknown[],
  /**
   * Tears the transport down when the table is replaced or unmounted. Rat
   * Screw's real-time transport holds timers for the slap window, so leaving it
   * running would keep flipping cards for a table nobody is looking at.
   */
  dispose?: (transport: T) => void,
): T | null {
  const [transport, setTransport] = useState<T | null>(null);

  useEffect(() => {
    let built: T | null = null;
    const timer = window.setTimeout(() => {
      built = create();
      setTransport(built);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (built) dispose?.(built);
    };
    // `create` is intentionally absent from the dependency list. It is a fresh
    // closure every render, so including it would rebuild the table on each
    // one; `deps` is the caller's declaration of what that closure actually
    // reads, and the closure captured when those last changed is by definition
    // the correct one to build from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return transport;
}

// ---------------------------------------------------------------------------
// 3. Sending a move to the room
// ---------------------------------------------------------------------------

export interface RoomDispatch {
  dispatch(move: string, payload?: unknown): void;
  /** Local send failures, which are separate from the room's own error state. */
  error: string | null;
  clearError(): void;
}

/**
 * Wraps `room.send` so a refused move becomes visible copy instead of an
 * unhandled throw. Identical in all nine pages, down to the message.
 */
export function useRoomDispatch(room: MultiplayerRoomSession): RoomDispatch {
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(
    (move: string, payload?: unknown) => {
      try {
        room.send(move, payload);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  const clearError = useCallback(() => setError(null), []);
  return { dispatch, error, clearError };
}

// ---------------------------------------------------------------------------
// 4. Reporting a finished match
// ---------------------------------------------------------------------------

/** How long the table holds after the final move before the podium takes over. */
export const MATCH_END_HOLD_MS = 900;

export interface MatchReport {
  /** The finished match, or null while it is still being played. */
  result: MatchResult | null;
  game: GameId;
  mode: MatchSnapshot['mode'];
  /** The human's seat. Null in a room that has not seated this client yet. */
  localSeat: number | null;
  seats: readonly RecordedSeat[];
  /**
   * Stable identity for this match. Solo tables mint a uuid; rooms derive one
   * from (code, seed, hash) so every peer writes the same ledger id for the
   * same match instead of nine different ones.
   */
  id: string;
  /**
   * Did the local player win? Defaults to "ranked first", which is wrong for
   * partnership games where a partner can hold rank 1 — Euchre and Spades pass
   * their own team-aware predicate.
   */
  won?: boolean;
  /**
   * Blitz's per-match counters. Every other game leaves these at zero; the
   * profile store treats them as optional flourishes, not required match facts.
   */
  metrics?: { blitzes: number; knocks: number; knockWins: number };
  /** Runs just before the podium; rooms use it to close and clear the session. */
  onLeave?(): void;
  /** Where Play Again goes. */
  playAgain(): void;
}

/**
 * Writes a finished match to the profile stats, the history ledger and the
 * podium, then routes to `/match-end`.
 *
 * This was forty lines duplicated eighteen times — twice per page — and the
 * copies had drifted: some computed `won` as `winner === localSeat`, some as
 * `rank === 1`, and the partnership games needed neither. Centralising it also
 * centralises the guard that made it safe: `reported` is a ref, not state, so a
 * re-render between the final move and the route change cannot write the match
 * to the ledger twice.
 */
export function useMatchReport(report: MatchReport): void {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reported = useRef(false);

  // The report object is rebuilt every render, so the effect below is keyed on
  // the one fact that decides whether to fire, and reads the rest through this
  // ref. Syncing in its own effect (rather than during render) keeps the write
  // out of the render pass; effects run in declaration order, so this one has
  // always landed before the reporting effect reads it.
  const latest = useRef(report);
  useEffect(() => {
    latest.current = report;
  });

  const { result, localSeat } = report;
  const settled = result !== null && localSeat !== null;

  useEffect(() => {
    if (!settled || reported.current) return;
    const current = latest.current;
    const matchResult = current.result;
    const seat = current.localSeat;
    if (!matchResult || seat === null) return;
    reported.current = true;

    const won =
      current.won ??
      (matchResult.rankings.find((rank) => rank.seat === seat)?.rank ??
        Number.POSITIVE_INFINITY) === 1;
    recordResult({ won, blitzes: 0, knocks: 0, knockWins: 0, ...current.metrics });

    const record = buildMatchRecord({
      id: current.id,
      at: Date.now(),
      game: current.game,
      mode: current.mode,
      result: matchResult,
      localSeat: seat,
      seats: current.seats,
    });
    if (record) recordMatch(record);

    setLastMatch({
      id: current.id,
      result: matchResult,
      seats: current.seats,
      game: current.game,
      mode: current.mode,
      localSeat: seat,
    });
    registerPlayAgain(() => current.playAgain());

    const timer = window.setTimeout(() => {
      latest.current.onLeave?.();
      router.push('/match-end');
    }, MATCH_END_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, settled]);
}

// ---------------------------------------------------------------------------
// Seat rosters
// ---------------------------------------------------------------------------

/**
 * The seat roster for a solo table.
 *
 * `localKey` names the human in the head-to-head ledger. Pages passed strings
 * like `'local-spades-player'` and `` friendKey(`seat-${seat}`) ``, which meant
 * the same person accrued a separate rivalry row per game. One key per human
 * seat is the honest reading, so it defaults here.
 */
export function soloSeats(
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    isBot?: boolean;
    /** Blitz seats bots by persona, so rivalries follow the character. */
    personaId?: string;
  }[],
  localKey = 'local-player',
): RecordedSeat[] {
  return players.map((player) => ({
    seat: player.seat,
    name: player.name,
    // The displayed avatar is always `avatarId`; only the ledger key prefers
    // the persona, so a bot's face and its rivalry row cannot drift apart.
    avatarId: player.avatarId,
    kind: player.isBot ? ('bot' as const) : ('friend' as const),
    key: player.isBot ? botKey(player.personaId ?? player.avatarId) : friendKey(localKey),
  }));
}

/** The seat roster for a friend room; every occupant is a real person. */
export function roomSeats(
  seats: readonly { seat: number; name: string; avatarId: string; profileId: string }[],
): RecordedSeat[] {
  return seats.map((seat) => ({
    seat: seat.seat,
    name: seat.name,
    avatarId: seat.avatarId,
    kind: 'friend' as const,
    key: friendKey(seat.profileId),
  }));
}

/**
 * A ledger id every peer in a room agrees on.
 *
 * Derived from the room code, the seed and the authority's last state hash, so
 * the same match is one entry in everyone's history rather than N entries that
 * never line up.
 */
export function roomMatchId(
  code: string | undefined,
  session: { seed: number; lastAppliedHash?: string | null; log: readonly unknown[] },
): string {
  return `multiplayer:${code ?? 'room'}:${session.seed}:${session.lastAppliedHash ?? session.log.length}`;
}

/** Leaves a room cleanly: drop the connection, then forget the session. */
export function leaveRoom(room: MultiplayerRoomSession): void {
  room.close();
  clearActiveMultiplayerSession();
}
