'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type FxEvent, type LegalMove } from '@parlour/engine';
import type { EuchreSuit } from '@parlour/game-euchre';
import { EuchreTableScreen } from '@/components/table/euchre/EuchreTableScreen';
import {
  EuchreTransport,
  type EuchreDispatch,
  type EuchreSnapshot,
} from '@/lib/solo/EuchreTransport';
import { euchreModeForRules } from '@/lib/euchre/modes';
import { euchreTableView, type EuchreTableView } from '@/lib/euchre/view';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import {
  clearActiveMultiplayerSession,
  euchreMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function EuchreTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'euchre') {
    return <ActiveMultiplayerEuchreTable room={multiplayer} />;
  }
  return <SoloEuchreTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloEuchreTablePage() {
  const mode = useEuchreSetupStore((state) => state.mode);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<EuchreTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new EuchreTransport({
          mode,
          seed: Date.now() | 0,
          player: { name, avatarId },
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, mode, name]);

  if (!transport) return <EuchreTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloEuchreTable transport={transport} />;
}

function ActiveSoloEuchreTable({ transport }: { transport: EuchreTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<EuchreTransport | null>(null);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: EuchreDispatch) => {
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
    const botSeat = snapshot.session.phase.actor;
    if (botSeat === null || botSeat === 0) return;
    // bidding decisions read as conversation; trick play keeps a human beat
    const delay =
      snapshot.session.state.stage === 'playing' ? 480 + botSeat * 90 : 320;
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
    snapshot.session.status,
    transport,
  ]);

  useEffect(() => {
    if (snapshot.matchWinnerTeam === null || reportedMatch.current === transport) return;
    if (!snapshot.session.result) return;
    reportedMatch.current = transport;
    recordResult({ won: localWon(snapshot), blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-euchre-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'euchre',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: snapshot.session.result,
      seats,
      game: 'euchre',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/euchre/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 900);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const view = euchreTableView(snapshot, transport.legalMoves());

  return (
    <EuchreTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={view.decision === null}
      error={error}
      onOrderUp={(alone) => dispatch('orderUp', { alone })}
      onCallTrump={(suit: EuchreSuit, alone) => dispatch('callTrump', { suit, alone })}
      onPass={() => dispatch('bidPass')}
      onDiscard={(card) => dispatch('dealerDiscard', { card })}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => router.push('/euchre')}
    />
  );
}

/** Team-aware win check: you won when your partnership reached the target first. */
function localWon(snapshot: EuchreSnapshot): boolean {
  const winnerTeam = snapshot.matchWinnerTeam;
  if (winnerTeam === null) return false;
  return winnerTeam === 0; // solo human always sits at seat 0
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerEuchreTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = euchreMultiplayerSession(snapshot);
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
    const mode = euchreModeForRules(session.config);
    const id = `multiplayer:${snapshot.room?.code ?? 'room'}:${session.seed}:${
      session.lastAppliedHash ?? session.log.length
    }`;
    const localRank =
      session.result.rankings.find((rank) => rank.seat === localSeat)?.rank ?? 99;
    recordResult({ won: localRank === 1, blitzes: 0, knocks: 0, knockWins: 0 });
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
      game: 'euchre',
      mode,
      result: session.result,
      localSeat,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: session.result,
      seats,
      game: 'euchre',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/euchre/create');
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
      <EuchreTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn =
    session.status === 'playing' && session.phase.actor === localSeat;
  const legal: readonly LegalMove[] = isLocalTurn
    ? session.def.flow.legalMoves(session.state, session.phase)
    : [];

  const view: EuchreTableView = euchreTableView(
    {
      mode: euchreModeForRules(session.config),
      players: snapshot.seats.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        isBot: player.bot,
      })),
      session,
      matchWinnerTeam: matchWinnerTeamOf(session),
    },
    legal,
    localSeat,
  );

  return (
    <EuchreTableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onOrderUp={(alone) => dispatch('orderUp', { alone })}
      onCallTrump={(suit: EuchreSuit, alone) => dispatch('callTrump', { suit, alone })}
      onPass={() => dispatch('bidPass')}
      onDiscard={(card) => dispatch('dealerDiscard', { card })}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/euchre');
      }}
    />
  );
}

function matchWinnerTeamOf(session: {
  result: { rankings: readonly { seat: number; rank: number }[] } | null;
}): 0 | 1 | null {
  if (!session.result) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}
