'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { type FxEvent } from '@parlour/engine';
import type { WildpileColor } from '@parlour/game-wildpile';
import { WildTableScreen } from '@/components/table/wild/WildTableScreen';
import { WildTransport, type WildDispatch, type WildSnapshot } from '@/lib/solo/WildTransport';
import { wildModeForRules } from '@/lib/wild/modes';
import { wildTableView } from '@/lib/wild/view';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  wildMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function WildTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'wildpile') {
    return <ActiveMultiplayerWildTable room={multiplayer} />;
  }
  return <SoloWildTablePage />;
}

function SoloWildTablePage() {
  const mode = useWildSetupStore((state) => state.mode);
  const seats = useWildSetupStore((state) => state.seats);
  const overrides = useWildSetupStore((state) => state.overrides);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<WildTransport | null>(null);
  const rules = wildRulesFor(mode, overrides);
  const rulesKey = JSON.stringify(rules);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new WildTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          rules: JSON.parse(rulesKey) as typeof rules,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
  }, [avatarId, mode, name, seats, rulesKey]);

  if (!transport) return <WildTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveWildTable transport={transport} />;
}

function ActiveMultiplayerWildTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = wildMultiplayerSession(snapshot);
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
    const mode = wildModeForRules(session.config);
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
      game: 'wild',
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
      game: 'wild',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/wild/create');
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
      <WildTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal = isLocalTurn ? session.def.flow.legalMoves(session.state, session.phase) : [];
  const mode = wildModeForRules(session.config);
  const wildSnapshot: WildSnapshot = {
    mode,
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
    <WildTableScreen
      view={wildTableView(wildSnapshot, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onPlay={(card) => dispatch('playCard', { card })}
      onDraw={() => dispatch('draw')}
      onChooseColor={(color: WildpileColor) => dispatch('chooseColor', { color })}
      onDeclineJump={() => dispatch('declineJump')}
      onCallLastCard={() => dispatch('callLastCard')}
      onChooseTarget={(seat: number) => dispatch('chooseTarget', { seat })}
      onPass={() => dispatch('pass')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/wild');
      }}
    />
  );
}

function ActiveWildTable({ transport }: { transport: WildTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<WildTransport | null>(null);
  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  const [fx, setFx] = useState<readonly FxEvent[]>(() => snapshot.session.setupFx ?? []);
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: WildDispatch) => {
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
    // Interrupt/color decisions read as reflexes; regular turns keep the human pace.
    const delay = snapshot.session.phase.phase === 'play' ? 480 + botSeat * 90 : 240;
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
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-wild-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'wild',
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
      game: 'wild',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/wild/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 900);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const view = wildTableView(snapshot, transport.legalMoves());

  return (
    <WildTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
      error={error}
      onPlay={(card) => dispatch('playCard', { card })}
      onDraw={() => dispatch('draw')}
      onChooseColor={(color: WildpileColor) => dispatch('chooseColor', { color })}
      onDeclineJump={() => dispatch('declineJump')}
      onCallLastCard={() => dispatch('callLastCard')}
      onChooseTarget={(seat: number) => dispatch('chooseTarget', { seat })}
      onPass={() => dispatch('pass')}
      onQuit={() => router.push('/wild')}
    />
  );
}
