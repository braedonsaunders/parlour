'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Fx, type FxEvent, type MatchResult } from '@parlour/engine';
import { RoundEndOverlay } from '@/components/celebration/RoundEndOverlay';
import { TableScreen, type TableView } from '@/components/table/TableScreen';
import { LocalTransport, type LocalDispatch, type SoloSnapshot } from '@/lib/solo/LocalTransport';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useSetupStore } from '@/stores/setup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
  type MultiplayerRoomSnapshot,
} from '../_multiplayer/roomSession';

export default function TablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer) return <ActiveMultiplayerTable room={multiplayer} />;
  return <SoloTablePage />;
}

function SoloTablePage() {
  const mode = useSetupStore((state) => state.mode);
  const seats = useSetupStore((state) => state.seats);
  const botTier = useSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<LocalTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const startedAtMs = Date.now();
      setTransport(
        new LocalTransport({
          mode,
          seats,
          botTier,
          seed: startedAtMs | 0,
          startedAtMs,
          player: { name, avatarId },
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, botTier, mode, name, seats]);

  if (!transport) return <TableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloTable transport={transport} />;
}

function ActiveMultiplayerTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const dispatch = useCallback(
    (move: string, payload?: unknown) => {
      try {
        room.send(move, payload);
        setLocalError(null);
        setSelectedCard(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  const view = multiplayerTableView(snapshot);
  const busy =
    !snapshot.session ||
    snapshot.localSeat === null ||
    snapshot.session.status !== 'playing' ||
    snapshot.session.phase.actor !== snapshot.localSeat;

  return (
    <TableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      selectedCard={selectedCard}
      busy={busy}
      error={localError ?? snapshot.error}
      onSelectCard={setSelectedCard}
      onDraw={(source) => dispatch(`draw.${source}`)}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onMenu={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/');
      }}
    />
  );
}

function multiplayerTableView(snapshot: MultiplayerRoomSnapshot): TableView | null {
  const session = snapshot.session;
  const localSeat = snapshot.localSeat;
  if (!session || localSeat === null) return null;
  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal = isLocalTurn ? session.def.flow.legalMoves(session.state, session.phase) : [];
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

function ActiveSoloTable({ transport }: { transport: LocalTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const reportedMatch = useRef<LocalTransport | null>(null);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [roundFx, setRoundFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: LocalDispatch) => {
    if (outcome.rejected) {
      setError(outcome.rejected.message);
      return;
    }
    setError(null);
    setSnapshot(outcome.snapshot);
    setFx(outcome.fx);
    setRoundFx((current) =>
      outcome.events.length === 0 && outcome.fx.some((event) => event.kind === Fx.DealCard)
        ? outcome.fx
        : [...current, ...outcome.fx],
    );
    setFxKey((key) => key + 1);
  }, []);

  const dispatch = useCallback(
    (move: string, payload?: unknown) => accept(transport.dispatch(move, payload)),
    [accept, transport],
  );

  useEffect(() => {
    if (snapshot.session.status !== 'playing' || snapshot.session.phase.actor === 0) return;
    const botSeat = snapshot.session.phase.actor;
    if (botSeat === null) return;
    const delay = snapshot.mode === 'timed' ? 120 : 480 + botSeat * 90;
    const timer = window.setTimeout(() => {
      try {
        accept(transport.playBotTurn());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The bot lost the thread.');
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    accept,
    snapshot.mode,
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.status,
    transport,
  ]);

  useEffect(() => {
    if (snapshot.mode !== 'timed' || snapshot.matchWinner !== null) return;
    const timer = window.setInterval(() => {
      const next = transport.tick(Date.now());
      if (next.matchWinner !== snapshot.matchWinner) setSnapshot(next);
    }, 250);
    return () => window.clearInterval(timer);
  }, [snapshot.matchWinner, snapshot.mode, transport]);

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

  useEffect(() => {
    if (snapshot.matchWinner === null || reportedMatch.current === transport) return;
    reportedMatch.current = transport;
    const result = matchResult(snapshot);
    const localMetrics = snapshot.metrics[0] ?? { blitzes: 0, knocks: 0, knockWins: 0 };
    recordResult({ won: snapshot.matchWinner === 0, ...localMetrics });
    setLastMatch({
      result,
      seats: snapshot.players.map(({ seat, name, avatarId }) => ({ seat, name, avatarId })),
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/table'));
    router.push('/match-end');
  }, [recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

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
        onMenu={() => router.push('/play')}
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
    players: snapshot.players.map((player) => ({
      ...player,
      hand: state.hands[player.seat] ?? [],
      handCount: state.hands[player.seat]?.length ?? 0,
      lives: scores[player.seat] ?? 0,
      isLocal: player.seat === 0,
      eliminated: snapshot.mode === 'classic' && snapshot.lives[player.seat] === 0,
    })),
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
