'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type FxEvent } from '@parlour/engine';
import type { PresidentRules } from '@parlour/game-president';
import { PresidentTableScreen } from '@/components/table/president/PresidentTableScreen';
import {
  PresidentTransport,
  type PresidentDispatch,
  type PresidentSnapshot,
} from '@/lib/solo/PresidentTransport';
import { presidentModeForRules } from '@/lib/president/modes';
import { presidentTableView } from '@/lib/president/view';
import { delayUntilFxSettles } from '@/lib/table/fx-motion';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  presidentMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function PresidentTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'president') {
    return <ActiveMultiplayerPresidentTable room={multiplayer} />;
  }
  return <SoloPresidentTablePage />;
}

function SoloPresidentTablePage() {
  const mode = usePresidentSetupStore((state) => state.mode);
  const seats = usePresidentSetupStore((state) => state.seats);
  const overrides = usePresidentSetupStore((state) => state.overrides);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<PresidentTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new PresidentTransport({
          mode,
          rules: presidentRulesFor(mode, overrides),
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, mode, name, overrides, seats]);

  if (!transport) return <PresidentTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActivePresidentTable transport={transport} />;
}

function ActiveMultiplayerPresidentTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = presidentMultiplayerSession(snapshot);
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
    const mode = presidentModeForRules(session.config as PresidentRules);
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
      game: 'president',
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
      game: 'president',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/president/create');
    });
    const timer = window.setTimeout(() => {
      room.close();
      clearActiveMultiplayerSession();
      router.push('/match-end');
    }, 1400);
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
      <PresidentTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalActing =
    session.status === 'playing' &&
    ((session.phase.actors ?? []).includes(localSeat) || session.phase.actor === localSeat);
  const legal = isLocalActing
    ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
    : [];
  const snapshotView: PresidentSnapshot = {
    mode: presidentModeForRules(session.config as PresidentRules),
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
    <PresidentTableScreen
      view={presidentTableView(snapshotView, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalActing}
      error={localError ?? snapshot.error}
      onConfirm={(cards) =>
        dispatch(
          session.phase.phase.startsWith('exchange')
            ? pickExchangeMove(session, localSeat)
            : 'playSet',
          { cards },
        )
      }
      onPass={() => dispatch('pass')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/president');
      }}
    />
  );
}

function pickExchangeMove(
  session: NonNullable<ReturnType<typeof presidentMultiplayerSession>>,
  seat: number,
): string {
  if ((session.phase.actors ?? []).includes(seat) && session.phase.phase === 'exchange-give') {
    return 'giveCards';
  }
  return 'returnCards';
}

function ActivePresidentTable({ transport }: { transport: PresidentTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<PresidentTransport | null>(null);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: PresidentDispatch) => {
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
    if (snapshot.session.status !== 'playing' || snapshot.session.phase.actor === 0) return;
    const botSeat = snapshot.session.phase.actor;
    if (botSeat === null) return;
    // Exchange decisions read as deliberation; regular turns keep the human pace.
    const pace = snapshot.session.phase.phase === 'play' ? 520 + botSeat * 80 : 420;
    const delay = delayUntilFxSettles(pace, fx);
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
    fx,
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.phase.phase,
    snapshot.session.status,
    transport,
  ]);

  useEffect(() => {
    if (snapshot.matchWinner === null || reportedMatch.current === transport) return;
    if (!snapshot.session.result) return;
    reportedMatch.current = transport;
    recordResult({ won: snapshot.matchWinner === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.name.toLowerCase()) : friendKey('local-president-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'president',
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
      game: 'president',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/president/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 1400);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const actingLocally =
    snapshot.session.status === 'playing' &&
    ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

  const view = presidentTableView(snapshot, actingLocally ? localLegalMoves(snapshot) : []);

  return (
    <PresidentTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={!actingLocally}
      error={error}
      onConfirm={(cards) =>
        dispatch(
          snapshot.session.phase.phase === 'exchange-give' ||
            ((snapshot.session.phase.actors ?? []).includes(0) &&
              snapshot.session.phase.phase === 'exchange-give')
            ? 'giveCards'
            : snapshot.session.state.awaitingReturn?.seat === 0
              ? 'returnCards'
              : 'playSet',
          { cards },
        )
      }
      onPass={() => dispatch('pass')}
      onQuit={() => router.push('/president')}
    />
  );
}

function localLegalMoves(snapshot: PresidentSnapshot) {
  const { session } = snapshot;
  if (session.status !== 'playing') return [];
  return (
    session.def.flow.legalMovesFor?.(session.state, session.phase, 0) ??
    session.def.flow.legalMoves(session.state, session.phase)
  );
}
