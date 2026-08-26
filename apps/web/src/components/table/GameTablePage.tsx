'use client';

import type { ReactNode } from 'react';
import type { FxEvent, GameSession, RuleValues } from '@parlour/engine';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useDeferredTransport } from '@/lib/table/useDeferredTransport';
import { useMatchReport, type MatchReport } from '@/lib/table/useMatchReport';
import {
  useActiveRoom,
  useExpectedRoom,
  useIsClient,
  useRoomTable,
  type RoomTable,
} from '@/lib/table/useRoomTable';
import {
  useSoloTable,
  type SoloRound,
  type SoloTableDispatch,
  type SoloTableTransport,
} from '@/lib/table/useSoloTable';
import type { MultiplayerRoomSession } from '@/app/_multiplayer/roomSession';

/**
 * The table page every game shares.
 *
 * A table page is the same program eight times over: work out whether this
 * device is sitting at a friend room or a solo table, build a transport a tick
 * after mount, run the bot loop, keep the fx timeline in step, report the match
 * when it ends, and hand over to the podium. Only four things ever differed —
 * which transport, how long a bot pauses, how a snapshot becomes a view, and
 * which screen draws it — and those are the fields of {@link TableGamePack}.
 *
 * The screens themselves are untouched. Their prop shapes are genuinely
 * game-specific (`onBid`/`onBidNil` versus `onPass`/`onPlayCard`), so a pack
 * renders its own screen through `renderSolo`/`renderRoom` rather than being
 * forced through a lowest-common-denominator interface that would flatten each
 * table's vocabulary. What is shared here is the scaffolding around the screen,
 * which held no game knowledge at all.
 */

export interface SoloTableContext<TTransport, TSnapshot, TDispatch> {
  transport: TTransport;
  snapshot: TSnapshot;
  fx: readonly FxEvent[];
  fxKey: number;
  error: string | null;
  dispatch(move: string, payload?: unknown): void;
  /** Escape hatch for tables that drive the transport directly (next hand). */
  accept(outcome: TDispatch): void;
  /**
   * Replaces the snapshot without a move. Blitz's timed clock polls the
   * transport; most packs never touch this.
   */
  setSnapshot?(snapshot: TSnapshot): void;
  /** Leaves the table for this game's shelf page. */
  quit(): void;
  /**
   * Routes with the felt wipe. Packs must use this rather than touching
   * `location` — the wipe is how a player leaves a table, and a hard
   * navigation would drop both the transition and the client-side stores the
   * podium is about to read.
   */
  push(href: string): void;
}

export interface RoomTableContext<S, C extends RuleValues> extends RoomTable<S, C> {
  room: MultiplayerRoomSession;
  session: GameSession<S, C>;
  localSeat: number;
  /** Leaves the room and returns to this game's shelf page. */
  quit(): void;
  /** Routes with the felt wipe; see {@link SoloTableContext.push}. */
  push(href: string): void;
}

export interface PendingTableProps {
  fx: readonly FxEvent[];
  fxKey: number | string;
  error: string | null;
  /** Overrides the game's usual dealing splash, e.g. while a room handle is missing. */
  loadingCopy?: string;
}

/** Room continuation is shared; packs report only the finished game facts. */
export type RoomMatchReport = Omit<MatchReport, 'onPlayAgain' | 'onFinish'>;

export interface TableGamePack<TSnapshot, TDispatch, TTransport, S, C extends RuleValues> {
  /** Shelf id — also the route segment, so `/hearts` and `/hearts/table`. */
  id: string;
  /** The engine def id a friend room announces. Usually the same as `id`. */
  gameId: string;
  /**
   * Where Quit sends the player. Defaults to `/${id}`. Blitz's shelf is
   * `/play`, not `/blitz`.
   */
  homeHref?: string;

  /**
   * Reads whatever setup state a fresh deal depends on and returns the factory
   * plus that dependency list. A hook, because the setup lives in a store.
   */
  useSoloDeal(): {
    create: () => TTransport;
    deps: readonly unknown[];
    /** Tears the transport down on unmount; see {@link useDeferredTransport}. */
    destroy?(transport: TTransport): void;
  };
  /**
   * Runs the solo table.
   *
   * Almost every game wants {@link turnBasedDriver}: hold the snapshot, replay
   * the fx timeline, and let a bot take its turn once the animation settles.
   * Rat Screw does not — it is real-time, its transport pushes updates on its
   * own clock, and there is no "bot's turn" to wait for. Making the driver a
   * field rather than a fixed call is what lets both live under one page
   * without the shared scaffolding growing a special case.
   */
  useSoloDriver: SoloDriver<TTransport, TSnapshot, TDispatch>;
  /**
   * Extra solo-side effects. Wild arms its turn and match clocks here; every
   * other game has none.
   */
  useSoloEffects?(ctx: SoloTableContext<TTransport, TSnapshot, TDispatch>): void;
  /**
   * Extra room-side effects, for tables that need one. Rat Screw's host arms
   * the authoritative slap-window close here; Wild's host arms both clocks.
   */
  useRoomEffects?(ctx: RoomTableContext<S, C> | null): void;

  /** The table screen with no view yet — still dealing, or a room still seating. */
  renderPending(props: PendingTableProps): ReactNode;

  renderSolo(ctx: SoloTableContext<TTransport, TSnapshot, TDispatch>): ReactNode;
  /** The finished-match report, or null while the table is still live. */
  soloReport(ctx: SoloTableContext<TTransport, TSnapshot, TDispatch>): MatchReport | null;

  /**
   * Optional: a game that has no friend-room support yet omits both of these.
   * The shelf reaches such a game only through its solo route, and the room
   * registry has no entry to seat one, so the room branch is unreachable — the
   * pending screen is what a stray URL gets rather than a faked table.
   */
  renderRoom?(ctx: RoomTableContext<S, C>): ReactNode;
  roomReport?(ctx: RoomTableContext<S, C>): RoomMatchReport | null;
}

export interface SoloDriverResult<TSnapshot, TDispatch> {
  snapshot: TSnapshot;
  fx: readonly FxEvent[];
  fxKey: number;
  error: string | null;
  dispatch(move: string, payload?: unknown): void;
  accept(outcome: TDispatch): void;
  setSnapshot?(snapshot: TSnapshot): void;
}

/** A hook that turns a live transport into everything the screen needs. */
export type SoloDriver<TTransport, TSnapshot, TDispatch> = (
  transport: TTransport,
) => SoloDriverResult<TSnapshot, TDispatch>;

/**
 * The ordinary turn-based driver: the bot loop, the fx timeline, and rejection
 * handling that `useSoloTable` already implements.
 */
export function turnBasedDriver<
  TSnapshot,
  TDispatch extends SoloTableDispatch<TSnapshot>,
  TTransport extends SoloTableTransport<TSnapshot, TDispatch>,
>(options: {
  round(snapshot: TSnapshot): SoloRound;
  botPaceMs(snapshot: TSnapshot): number;
  fxFor?(outcome: TDispatch): readonly FxEvent[];
  onAccepted?(outcome: TDispatch): void;
}): SoloDriver<TTransport, TSnapshot, TDispatch> {
  return (transport) => useSoloTable<TSnapshot, TDispatch>(transport, options);
}

/** Packs with no extra effects share these, so the hook call sites stay fixed. */
function useNoRoomEffects(): void {}
function useNoSoloEffects(): void {}

export function GameTablePage<TSnapshot, TDispatch, TTransport, S, C extends RuleValues>({
  pack,
}: {
  pack: TableGamePack<TSnapshot, TDispatch, TTransport, S, C>;
}) {
  const room = useActiveRoom(pack.gameId);
  const expectedRoom = useExpectedRoom(pack.gameId);
  const isClient = useIsClient();
  // Two components rather than two branches in one: the solo table and the room
  // table hold different hooks, so swapping between them has to remount.
  // Until this tab is on the client snapshot, and while a room handoff is
  // still resolving, stay on the splash — never a solo deal with default rules.
  if (!isClient || (expectedRoom && !room)) {
    return (
      <>
        {pack.renderPending({
          fx: [],
          fxKey: 'loading',
          error: null,
          loadingCopy: expectedRoom ? 'Finding the table…' : undefined,
        })}
      </>
    );
  }
  if (room) return <RoomTablePage pack={pack} room={room} />;
  return <SoloTablePage pack={pack} />;
}

function SoloTablePage<TSnapshot, TDispatch, TTransport, S, C extends RuleValues>({
  pack,
}: {
  pack: TableGamePack<TSnapshot, TDispatch, TTransport, S, C>;
}) {
  const { create, deps, destroy } = pack.useSoloDeal();
  const transport = useDeferredTransport(create, deps, destroy);
  if (!transport) return <>{pack.renderPending({ fx: [], fxKey: 'loading', error: null })}</>;
  return <ActiveSoloTable pack={pack} transport={transport} />;
}

function ActiveSoloTable<TSnapshot, TDispatch, TTransport, S, C extends RuleValues>({
  pack,
  transport,
}: {
  pack: TableGamePack<TSnapshot, TDispatch, TTransport, S, C>;
  transport: TTransport;
}) {
  const router = useWipeRouter();
  const { snapshot, fx, fxKey, error, dispatch, accept, setSnapshot } =
    pack.useSoloDriver(transport);
  const home = pack.homeHref ?? `/${pack.id}`;

  const ctx: SoloTableContext<TTransport, TSnapshot, TDispatch> = {
    transport,
    snapshot,
    fx,
    fxKey,
    error,
    dispatch,
    accept,
    setSnapshot,
    quit: () => router.push(home),
    push: (href: string) => router.push(href),
  };

  (pack.useSoloEffects ?? useNoSoloEffects)(ctx);
  // Keyed on the transport: Play Again on the same route builds a new one, and
  // the second match has to be reported as well as the first.
  useMatchReport(pack.soloReport(ctx), transport);

  return <>{pack.renderSolo(ctx)}</>;
}

function RoomTablePage<TSnapshot, TDispatch, TTransport, S, C extends RuleValues>({
  pack,
  room,
}: {
  pack: TableGamePack<TSnapshot, TDispatch, TTransport, S, C>;
  room: MultiplayerRoomSession;
}) {
  const router = useWipeRouter();
  const table = useRoomTable<S, C>(room, pack.gameId);
  const { session, localSeat, snapshot, error } = table;
  const home = pack.homeHref ?? `/${pack.id}`;

  const ctx: RoomTableContext<S, C> | null =
    session && localSeat !== null
      ? {
          ...table,
          room,
          session,
          localSeat,
          quit: () => table.leave(() => router.push(home)),
          push: (href: string) => router.push(href),
        }
      : null;

  // Hooks cannot sit behind the null check, so both of these run every render
  // and are simply inert while the room is still seating.
  (pack.useRoomEffects ?? useNoRoomEffects)(ctx);
  const gameReport = ctx && pack.roomReport ? pack.roomReport(ctx) : null;
  const report = gameReport
    ? {
        ...gameReport,
        // A friend rematch belongs to the room, not to fourteen separate create
        // pages. Keep the mesh alive through the podium; one request deals a
        // fresh match and the match-end screen follows it on every peer.
        onPlayAgain: () => room.rematch(),
        onFinish: () => router.push('/match-end'),
      }
    : null;
  useMatchReport(report, ctx ? `${snapshot.room?.code ?? 'room'}:${ctx.session.seed}` : room);

  if (!ctx || !pack.renderRoom) {
    return <>{pack.renderPending({ fx: snapshot.fx, fxKey: snapshot.fxKey, error })}</>;
  }
  return <>{pack.renderRoom(ctx)}</>;
}

/**
 * Identity helper that pins a pack's five type parameters from its literal.
 *
 * Without it every pack would have to spell out `TableGamePack<HeartsSnapshot,
 * HeartsDispatch, HeartsTransport, HeartsState, HeartsRules>` by hand, and a
 * mismatch between the snapshot type and the transport that produces it would
 * surface as an error at the *page*, a file away from the mistake.
 */
export function defineTablePack<TSnapshot, TDispatch, TTransport, S, C extends RuleValues>(
  pack: TableGamePack<TSnapshot, TDispatch, TTransport, S, C>,
): TableGamePack<TSnapshot, TDispatch, TTransport, S, C> {
  return pack;
}
