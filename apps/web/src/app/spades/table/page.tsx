'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type LegalMove } from '@parlour/engine';
import { SpadesTableScreen } from '@/components/table/spades/SpadesTableScreen';
import { SpadesTransport, type SpadesSnapshot } from '@/lib/solo/SpadesTransport';
import { spadesModeForRules } from '@/lib/spades/modes';
import { spadesTableView, type SpadesTableView } from '@/lib/spades/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import {
  clearActiveMultiplayerSession,
  multiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';
import type { SpadesRules, SpadesState } from '@parlour/game-spades';

export default function SpadesTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'spades') {
    return <ActiveMultiplayerSpadesTable room={multiplayer} />;
  }
  return <SoloSpadesTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloSpadesTablePage() {
  const mode = useSpadesSetupStore((state) => state.mode);
  const botTier = useSpadesSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<SpadesTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new SpadesTransport({
          mode,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, botTier, mode, name]);

  if (!transport) return <SpadesTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloSpadesTable transport={transport} />;
}

function ActiveSoloSpadesTable({ transport }: { transport: SpadesTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<SpadesTransport | null>(null);
  // Bidding is a conversation; trick play keeps a human beat.
  const botPaceMs = useCallback(
    (current: SpadesSnapshot) =>
      current.session.state.stage === 'bidding'
        ? 520
        : 420 + (current.session.phase.actor ?? 0) * 70,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  useEffect(() => {
    if (snapshot.matchWinnerTeam === null || reportedMatch.current === transport) return;
    if (!snapshot.session.result) return;
    reportedMatch.current = transport;
    recordResult({ won: snapshot.matchWinnerTeam === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-spades-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'spades',
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
      game: 'spades',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/spades/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 900);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const view = spadesTableView(snapshot, transport.legalMoves());

  return (
    <SpadesTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={view.decision === null}
      error={error}
      onBid={(bid) => dispatch('bid', { bid })}
      onBidNil={() => dispatch('bidNil')}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => router.push('/spades')}
    />
  );
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerSpadesTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const setSetupMode = useSpadesSetupStore((state) => state.setMode);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = multiplayerSession<SpadesState, SpadesRules>(snapshot, 'spades');
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
    const mode = spadesModeForRules(session.config);
    const id = `multiplayer:${snapshot.room?.code ?? 'room'}:${session.seed}:${
      session.lastAppliedHash ?? session.log.length
    }`;
    const localRank = session.result.rankings.find((rank) => rank.seat === localSeat)?.rank ?? 99;
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
      game: 'spades',
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
      game: 'spades',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      // The new room is built from the setup store, so a rematch has to carry
      // the mode this match was actually played under. Without this a guest
      // who joined a Quick or Clean Books table would silently host Classic.
      setSetupMode(mode);
      router.push('/spades/create');
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
    setSetupMode,
    snapshot.room?.code,
    snapshot.seats,
  ]);

  if (!session || localSeat === null) {
    return (
      <SpadesTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal: readonly LegalMove[] = isLocalTurn
    ? session.def.flow.legalMoves(session.state, session.phase)
    : [];

  const view: SpadesTableView = spadesTableView(
    {
      mode: spadesModeForRules(session.config),
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
    <SpadesTableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onBid={(bid) => dispatch('bid', { bid })}
      onBidNil={() => dispatch('bidNil')}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/spades');
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
