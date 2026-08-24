'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type FxEvent, type MatchResult } from '@parlour/engine';
import type { CribbageConfig } from '@parlour/game-cribbage';
import { CribbageTableScreen } from '@/components/table/cribbage/CribbageTableScreen';
import { cribbageModeForRules } from '@/lib/cribbage/modes';
import { cribbageTableView, type CribbageSnapshotLike } from '@/lib/cribbage/view';
import { CribbageTransport, type CribbageDispatch } from '@/lib/solo/CribbageTransport';
import { delayUntilFxSettles } from '@/lib/table/fx-motion';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';
import {
  clearActiveMultiplayerSession,
  cribbageMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CribbageTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'cribbage')
    return <MultiplayerTable room={multiplayer} />;
  return <SoloTable />;
}

function SoloTable() {
  const mode = useCribbageSetupStore((state) => state.mode);
  const botTier = useCribbageSetupStore((state) => state.botTier);
  const overrides = useCribbageSetupStore((state) => state.overrides);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<CribbageTransport | null>(null);
  const rulesKey = JSON.stringify(cribbageRulesFor(mode, overrides));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new CribbageTransport({
          mode,
          botTier,
          seed: Date.now() | 0,
          player: { name, avatarId },
          rules: JSON.parse(rulesKey) as CribbageConfig,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, botTier, mode, name, rulesKey]);

  if (!transport) return <CribbageTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloTable transport={transport} />;
}

function ActiveSoloTable({ transport }: { transport: CribbageTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reported = useRef(false);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.match.round.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: CribbageDispatch) => {
    if (outcome.rejected) {
      setError(outcome.rejected.message);
      return;
    }
    setError(null);
    setSnapshot(outcome.snapshot);
    setFx(outcome.fx);
    setFxKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (snapshot.match.status !== 'playing' || transport.humanCanAct() || !transport.botCanAct())
      return;
    const waitMs = delayUntilFxSettles(420, fx);
    const timer = window.setTimeout(() => accept(transport.playBotTurn()), waitMs);
    return () => window.clearTimeout(timer);
  }, [accept, fx, snapshot, transport]);

  useEffect(() => {
    const result = snapshot.match.result;
    if (!result || reported.current) return;
    reported.current = true;
    const localSeat = 0;
    const id = `solo:cribbage:${snapshot.match.seed}:${snapshot.match.roundLogs.length}`;
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.personaId) : 'local:self',
    }));
    recordResult({ won: result.winner === localSeat, blitzes: 0, knocks: 0, knockWins: 0 });
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'cribbage',
      mode: snapshot.mode,
      result,
      localSeat,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({ id, result, seats, game: 'cribbage', mode: snapshot.mode, localSeat });
    registerPlayAgain(() => router.push('/cribbage'));
    const timer = window.setTimeout(() => router.push('/match-end'), 950);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot]);

  const legal = transport.legalMoves(0);
  const view = cribbageTableView(snapshot, legal, 0);
  const dispatch = (move: string, payload?: unknown) => accept(transport.dispatch(move, payload));
  return (
    <CribbageTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={!transport.humanCanAct()}
      error={error}
      onDiscard={(cards) => dispatch('crib.discard', { cards })}
      onCut={() => dispatch('cut')}
      onPlay={(card) => dispatch('playCard', { card })}
      onClaim={() => dispatch('claim')}
      onSteal={() => dispatch('steal')}
      onQuit={() => router.push('/cribbage')}
    />
  );
}

function MultiplayerTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reported = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = cribbageMultiplayerSession(snapshot);
  const localSeat = snapshot.localSeat;

  const dispatch = useCallback(
    (move: string, payload?: unknown) => {
      try {
        room.send(move, payload);
        setLocalError(null);
      } catch (caught) {
        setLocalError(caught instanceof Error ? caught.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  useEffect(() => {
    if (!session?.result || localSeat === null || reported.current) return;
    reported.current = true;
    const result = cribbageRoomResult(session.result);
    const mode = cribbageModeForRules(session.config);
    const id = `multiplayer:${snapshot.room?.code ?? 'room'}:${session.seed}:${session.lastAppliedHash ?? session.log.length}`;
    const seats = snapshot.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      avatarId: seat.avatarId,
      kind: 'friend' as const,
      key: friendKey(seat.profileId),
    }));
    recordResult({ won: result.winner === localSeat, blitzes: 0, knocks: 0, knockWins: 0 });
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'cribbage',
      mode,
      result,
      localSeat,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({ id, result, seats, game: 'cribbage', mode, localSeat });
    registerPlayAgain(() => router.push('/cribbage/create'));
    const timer = window.setTimeout(() => {
      room.close();
      clearActiveMultiplayerSession();
      router.push('/match-end');
    }, 950);
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
      <CribbageTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }
  const legal =
    session.status === 'playing'
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
        (session.phase.actor === localSeat
          ? session.def.flow.legalMoves(session.state, session.phase)
          : []))
      : [];
  const mode = cribbageModeForRules(session.config);
  const winners =
    session.result?.rankings.filter((rank) => rank.rank === 1).map((rank) => rank.seat) ?? [];
  const renderSnapshot: CribbageSnapshotLike = {
    mode,
    players: snapshot.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      avatarId: seat.avatarId,
      personaId: seat.profileId,
      isBot: seat.bot,
    })),
    match: {
      status: session.status === 'ended' ? 'ended' : 'playing',
      round: session,
      match: {
        wins: snapshot.seats.map((seat) => (winners.includes(seat.seat) ? 1 : 0)),
        targetWins: 1,
      },
    },
  };
  return (
    <CribbageTableScreen
      view={cribbageTableView(renderSnapshot, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={legal.length === 0}
      error={localError ?? snapshot.error}
      onDiscard={(cards) => dispatch('crib.discard', { cards })}
      onCut={() => dispatch('cut')}
      onPlay={(card) => dispatch('playCard', { card })}
      onClaim={() => dispatch('claim')}
      onSteal={() => dispatch('steal')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/cribbage');
      }}
    />
  );
}

function cribbageRoomResult(result: MatchResult): MatchResult {
  return {
    ...result,
    rankings: result.rankings.map((ranking) => ({
      ...ranking,
      detail: {
        ...ranking.detail,
        wins: ranking.rank === 1 ? 1 : 0,
      },
    })),
  };
}
