'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type FxEvent } from '@parlour/engine';
import type { GinModeId } from '@/lib/gin/modes';
import { GinTableScreen } from '@/components/table/gin/GinTableScreen';
import { GinTransport, type GinDispatch, type GinSnapshot } from '@/lib/solo/GinTransport';
import { ginTableView } from '@/lib/gin/view';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useGinSetupStore } from '@/stores/ginSetup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  ginMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function GinTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'gin') {
    return <ActiveMultiplayerGinTable room={multiplayer} />;
  }
  return <SoloGinTablePage />;
}

function SoloGinTablePage() {
  const mode = useGinSetupStore((state) => state.mode);
  const botTier = useGinSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<GinTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new GinTransport({
          mode,
          botTier,
          seed: Date.now() | 0,
          player: { name, avatarId },
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, mode, botTier, name]);

  if (!transport) return <GinTableScreen view={null} fx={[]} fxKey="loading" />;
  return <SoloGinTable transport={transport} />;
}

function SoloGinTable({ transport }: { transport: GinTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<GinTransport | null>(null);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: GinDispatch) => {
    if (outcome.rejected) {
      setError(outcome.rejected.message);
      return;
    }
    setError(null);
    setSnapshot(outcome.snapshot);
    setFx(outcome.fx);
    setFxKey((key) => key + 1);
  }, []);

  const dispatch = useCallback(
    (move: string, payload?: unknown) => accept(transport.dispatch(move, payload)),
    [accept, transport],
  );

  useEffect(() => {
    if (snapshot.session.status !== 'playing') return;
    const actor = snapshot.session.phase.actor;
    if (actor === null || actor === 0) return;
    // the ready window reads as a reflex; in-hand decisions keep human pace
    const delay =
      snapshot.session.state.folded && snapshot.session.phase.phase === 'hand-end' ? 420 : 520;
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
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.phase.phase,
    snapshot.session.state.folded,
    snapshot.session.status,
    transport,
  ]);

  useEffect(() => {
    if (snapshot.matchWinner === null || reportedMatch.current === transport) return;
    reportedMatch.current = transport;
    recordResult({ won: snapshot.matchWinner === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-gin-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'gin',
      mode: snapshot.mode,
      result: snapshot.session.result!,
      localSeat: 0,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: snapshot.session.result!,
      seats,
      game: 'gin',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/gin/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 900);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const view = ginTableView(snapshot, transport.legalMoves());

  return (
    <GinTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      mode={snapshot.mode}
      busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
      error={error}
      onTakeUpcard={() => dispatch('option.take')}
      onPassUpcard={() => dispatch('option.pass')}
      onDraw={(source) => dispatch(source === 'stock' ? 'draw.stock' : 'draw.discard')}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onReady={() => dispatch('ready')}
      onQuit={() => router.push('/gin')}
    />
  );
}

function ActiveMultiplayerGinTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = ginMultiplayerSession(snapshot);
  const localSeat = snapshot.localSeat;

  const dispatch = useCallback(
    (move: string, payload?: unknown) => {
      try {
        room.send(move, payload);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  useEffect(() => {
    if (!session?.result || localSeat === null || reportedMatch.current) return;
    reportedMatch.current = true;
    const id = `multiplayer:${snapshot.room?.code ?? 'room'}:${session.seed}:${
      session.lastAppliedHash ?? session.log.length
    }`;
    recordResult({ won: session.result.winner === localSeat, blitzes: 0, knocks: 0, knockWins: 0 });
    const seats = snapshot.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      avatarId: seat.avatarId,
      kind: 'friend' as const,
      key: friendKey(seat.profileId),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'gin',
      mode: 'classic',
      result: session.result,
      localSeat,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: session.result,
      seats,
      game: 'gin',
      mode: 'classic',
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/gin/create');
    });
    const timer = window.setTimeout(() => {
      room.close();
      clearActiveMultiplayerSession();
      router.push('/match-end');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    localSeat,
    recordMatch,
    recordResult,
    registerPlayAgain,
    room,
    router,
    session,
    setLastMatch,
    snapshot.room?.code,
    snapshot.seats,
  ]);

  if (!session || localSeat === null) {
    return (
      <GinTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn =
    session.status === 'playing' && !session.state.folded && session.phase.actor === localSeat;
  const legal = isLocalTurn
    ? session.def.flow.legalMovesFor!(session.state, session.phase, localSeat)
    : [];
  const snap: GinSnapshot = {
    mode: 'classic' as GinModeId,
    players: snapshot.seats.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      isBot: player.bot,
    })),
    session,
    matchWinner: session.result?.winner ?? null,
  };

  return (
    <GinTableScreen
      view={ginTableView(snap, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onTakeUpcard={() => dispatch('option.take')}
      onPassUpcard={() => dispatch('option.pass')}
      onDraw={(source) => dispatch(source === 'stock' ? 'draw.stock' : 'draw.discard')}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onReady={() => dispatch('ready')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/gin');
      }}
    />
  );
}
