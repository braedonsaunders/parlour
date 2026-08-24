'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { Fx, isActingSeat, type FxEvent, type MatchResult } from '@parlour/engine';
import { RoundEndOverlay } from '@/components/celebration/RoundEndOverlay';
import { TableScreen, type TableView } from '@/components/table/TableScreen';
import { LocalTransport, type LocalDispatch, type SoloSnapshot } from '@/lib/solo/LocalTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import {
  leaveRoom,
  roomMatchId,
  roomSeats,
  soloSeats,
  useMatchReport,
  useMultiplayerRoom,
  useRoomDispatch,
  useSoloTransport,
} from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { useSetupStore } from '@/stores/setup';
import {
  multiplayerSession,
  type MultiplayerRoomSession,
  type MultiplayerRoomSnapshot,
} from '../_multiplayer/roomSession';
import type { BlitzConfig, BlitzState } from '@parlour/game-blitz';

export default function TablePage() {
  const room = useMultiplayerRoom('blitz');
  if (room) return <ActiveMultiplayerTable room={room} />;
  return <SoloTablePage />;
}

function SoloTablePage() {
  const mode = useSetupStore((state) => state.mode);
  const seats = useSetupStore((state) => state.seats);
  const botTier = useSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(() => {
    const startedAtMs = Date.now();
    return new LocalTransport({
      mode,
      seats,
      botTier,
      seed: startedAtMs | 0,
      startedAtMs,
      player: { name, avatarId },
    });
  }, [avatarId, botTier, mode, name, seats]);

  if (!transport) return <TableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloTable transport={transport} />;
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const { dispatch, error: localError } = useRoomDispatch(room);

  const view = multiplayerTableView(snapshot);
  const session = multiplayerSession<BlitzState, BlitzConfig>(snapshot, 'blitz');
  const localSeat = snapshot.localSeat;
  const busy =
    !session ||
    localSeat === null ||
    session.status !== 'playing' ||
    !isActingSeat(session.phase, localSeat);

  useMatchReport({
    result: session?.status === 'ended' ? (session.result ?? null) : null,
    game: 'blitz',
    mode: 'fast',
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/create'),
    onLeave: () => leaveRoom(room),
  });

  return (
    <TableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={busy}
      error={localError ?? snapshot.error}
      onDraw={(source) => dispatch(`draw.${source}`)}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onQuit={() => {
        leaveRoom(room);
        router.push('/');
      }}
    />
  );
}

function multiplayerTableView(snapshot: MultiplayerRoomSnapshot): TableView | null {
  const session = multiplayerSession<BlitzState, BlitzConfig>(snapshot, 'blitz');
  const localSeat = snapshot.localSeat;
  if (!session || localSeat === null) return null;
  const isLocalTurn = session.status === 'playing' && isActingSeat(session.phase, localSeat);
  const legal = isLocalTurn
    ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
      session.def.flow.legalMoves(session.state, session.phase))
    : [];
  const moveIds = new Set(legal.map((move) => move.id));
  const discardCards = legal.flatMap((move) =>
    move.id === 'discard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
  return {
    players: snapshot.seats.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      hand: player.seat === localSeat ? (session.state.hands[player.seat] ?? []) : [],
      handCount: session.state.hands[player.seat]?.length ?? 0,
      lives: 3,
      isLocal: player.seat === localSeat,
      isBot: player.bot,
    })),
    activeSeat: session.phase.actor,
    stockCount: session.state.stock.length,
    discard: session.state.discard,
    phaseLabel: `friend room ${snapshot.room?.code ?? ''}`,
    legal: {
      drawStock: moveIds.has('draw.stock'),
      drawDiscard: moveIds.has('draw.discard'),
      discardCards,
      knock: moveIds.has('knock'),
    },
  };
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function ActiveSoloTable({ transport }: { transport: LocalTransport }) {
  const router = useWipeRouter();
  /**
   * The round-end overlay replays a whole round, not the last move, so this
   * accumulates alongside the per-move `fx` the shared runtime manages. A deal
   * (no events, but DealCard fx) starts a fresh round timeline; everything else
   * appends.
   */
  const [roundFx, setRoundFx] = useState<readonly FxEvent[]>(
    () => transport.getSnapshot().session.setupFx ?? [],
  );

  const onAccepted = useCallback((outcome: LocalDispatch) => {
    setRoundFx((current) =>
      outcome.events.length === 0 && outcome.fx.some((event) => event.kind === Fx.DealCard)
        ? outcome.fx
        : [...current, ...outcome.fx],
    );
  }, []);

  // Timed tables keep a brisk pace so the match clock stays the pressure.
  const botPaceMs = useCallback(
    (current: SoloSnapshot) =>
      current.mode === 'timed' ? 120 : 480 + (current.session.phase.actor ?? 0) * 90,
    [],
  );

  const { snapshot, fx, fxKey, error, dispatch, accept, setSnapshot } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
    onAccepted,
  });

  // Timed mode only: the match clock, and the seven-second turn timer that
  // plays a legal move for a human who has run out of it.
  useEffect(() => {
    if (snapshot.mode !== 'timed' || snapshot.matchWinner !== null) return;
    const timer = window.setInterval(() => {
      const next = transport.tick(Date.now());
      if (next.matchWinner !== snapshot.matchWinner) setSnapshot(next);
    }, 250);
    return () => window.clearInterval(timer);
  }, [setSnapshot, snapshot.matchWinner, snapshot.mode, transport]);

  useEffect(() => {
    if (
      snapshot.mode !== 'timed' ||
      snapshot.session.status !== 'playing' ||
      snapshot.session.phase.actor !== 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const legal = transport.legalMoves();
      const automatic = legal.find((move) => move.id === 'draw.stock') ?? legal[0];
      if (automatic) accept(transport.dispatch(automatic.id, automatic.payload));
    }, 7_000);
    return () => window.clearTimeout(timer);
  }, [
    accept,
    snapshot.mode,
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.status,
    transport,
  ]);

  const localMetrics = snapshot.metrics[0] ?? { blitzes: 0, knocks: 0, knockWins: 0 };
  useMatchReport({
    result: snapshot.matchWinner === null ? null : matchResult(snapshot),
    game: 'blitz',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:blitz:${snapshot.session.seed}`,
    won: snapshot.matchWinner === 0,
    metrics: localMetrics,
    playAgain: () => router.push('/table'),
  });

  const view = tableView(snapshot, transport);
  const nextRound = useCallback(() => accept(transport.startNextRound()), [accept, transport]);

  return (
    <>
      <TableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
        error={error}
        onDraw={(source) => dispatch(`draw.${source}`)}
        onDiscard={(card) => dispatch('discard', { card })}
        onKnock={() => dispatch('knock')}
        onQuit={() => router.push('/play')}
      />
      {snapshot.session.status === 'ended' && snapshot.matchWinner === null && (
        <RoundEndOverlay
          fx={roundFx}
          seats={snapshot.players.map(({ seat, name, avatarId }) => ({ seat, name, avatarId }))}
          livesBySeat={Object.fromEntries(snapshot.lives.map((lives, seat) => [seat, lives]))}
          onNextRound={nextRound}
        />
      )}
    </>
  );
}

function tableView(snapshot: SoloSnapshot, transport: LocalTransport): TableView {
  const state = snapshot.session.state;
  const isHumanTurn = snapshot.session.status === 'playing' && snapshot.session.phase.actor === 0;
  const legal = isHumanTurn ? transport.legalMoves() : [];
  const moveIds = new Set(legal.map(({ id }) => id));
  const discardCards = legal.flatMap((move) =>
    move.id === 'discard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
  const scores = snapshot.mode === 'classic' ? snapshot.lives : snapshot.wins;
  const scoreLabel = snapshot.mode === 'classic' ? 'lives' : 'wins';
  return {
    players: snapshot.players.map((player) => {
      const eliminated = snapshot.mode === 'classic' && snapshot.lives[player.seat] === 0;
      return {
        ...player,
        hand: eliminated ? [] : (state.hands[player.seat] ?? []),
        handCount: eliminated ? 0 : (state.hands[player.seat]?.length ?? 0),
        lives: scores[player.seat] ?? 0,
        isLocal: player.seat === 0,
        eliminated,
      };
    }),
    activeSeat: snapshot.session.phase.actor,
    stockCount: state.stock.length,
    discard: state.discard,
    phaseLabel: `${snapshot.mode} · round ${snapshot.round} · ${scoreLabel}`,
    legal: {
      drawStock: moveIds.has('draw.stock'),
      drawDiscard: moveIds.has('draw.discard'),
      discardCards,
      knock: moveIds.has('knock'),
    },
  };
}

function matchResult(snapshot: SoloSnapshot): MatchResult {
  const values = snapshot.mode === 'classic' ? snapshot.lives : snapshot.wins;
  const ordered = values
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => b.value - a.value || a.seat - b.seat);
  let priorValue: number | null = null;
  let priorRank = 0;
  return {
    winner: snapshot.matchWinner,
    reason:
      snapshot.mode === 'classic'
        ? 'last player standing'
        : snapshot.mode === 'fast'
          ? 'first to three'
          : 'time expired',
    rankings: ordered.map(({ seat, value }, index) => {
      if (value !== priorValue) priorRank = index + 1;
      priorValue = value;
      const detail: Record<string, number> =
        snapshot.mode === 'classic'
          ? { livesLeft: value, ...snapshot.metrics[seat] }
          : { roundWins: value, ...snapshot.metrics[seat] };
      return {
        seat,
        rank: priorRank,
        detail,
      };
    }),
  };
}
