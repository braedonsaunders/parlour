'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { FxEvent } from '@parlour/engine';
import { RatscrewTableScreen } from '@/components/table/ratscrew/RatscrewTableScreen';
import { RatscrewTransport, type RatscrewSnapshot } from '@/lib/solo/RatscrewTransport';
import { SLAP_GRACE_MS } from '@parlour/game-ratscrew';
import { ratscrewModeForRules } from '@/lib/ratscrew/modes';
import { ratscrewTableView } from '@/lib/ratscrew/view';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useRatscrewSetupStore, ratscrewRulesFor } from '@/stores/ratscrewSetup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  ratscrewMultiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function RatscrewTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'ratscrew') {
    return <ActiveMultiplayerRatscrewTable room={multiplayer} />;
  }
  return <SoloRatscrewTablePage />;
}

function SoloRatscrewTablePage() {
  const mode = useRatscrewSetupStore((state) => state.mode);
  const seats = useRatscrewSetupStore((state) => state.seats);
  const overrides = useRatscrewSetupStore((state) => state.overrides);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<RatscrewTransport | null>(null);
  const rules = ratscrewRulesFor(mode, overrides);
  const rulesKey = JSON.stringify(rules);

  useEffect(() => {
    let active: RatscrewTransport | null = null;
    const timer = window.setTimeout(() => {
      active = new RatscrewTransport({
        seats,
        seed: Date.now() | 0,
        rules: JSON.parse(rulesKey) as typeof rules,
        player: { name, avatarId },
      });
      setTransport(active);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      active?.dispose();
    };
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
  }, [avatarId, name, seats, rulesKey]);

  if (!transport) return <RatscrewTableScreen view={null} fx={[]} fxKey="loading" />;
  return <LiveRatscrewTable transport={transport} />;
}

/** Drives the UI off the transport's real-time notifications. */
function LiveRatscrewTable({ transport }: { transport: RatscrewTransport }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const [, setTick] = useState(0);
  const [fx, setFx] = useState<readonly FxEvent[]>(
    () => transport.getSnapshot().session.setupFx ?? [],
  );
  const [fxKey, setFxKey] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = transport.subscribe(() => {
      const batch = transport.drainRecentFx();
      setTick((tick) => tick + 1);
      if (batch.length > 0) {
        setFx(batch);
        setFxKey((key) => key + 1);
      }
    });
    return unsubscribe;
  }, [transport]);

  const snapshot = transport.getSnapshot();

  const reportAndLeave = useCallback(() => {
    if (reportedRef.current || !snapshot.session.result) return;
    reportedRef.current = true;
    recordResult({ won: snapshot.matchWinner === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-ratscrew-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'ratscrew',
      mode: ratscrewModeForRules(snapshot.session.config),
      result: snapshot.session.result,
      localSeat: 0,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: snapshot.session.result,
      seats,
      game: 'ratscrew',
      mode: ratscrewModeForRules(snapshot.session.config),
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/ratscrew/table'));
    const timer = window.setTimeout(() => router.push('/match-end'), 900);
    return () => window.clearTimeout(timer);
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot]);

  useEffect(() => {
    const cleanup = reportAndLeave();
    return cleanup;
  }, [reportAndLeave]);

  const view = ratscrewTableView(snapshot, transport.legalMoves());

  return (
    <RatscrewTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={false}
      error={null}
      onFlip={() => transport.dispatch('flip')}
      onSlap={() => transport.dispatch('slap')}
      onQuit={() => {
        transport.dispose();
        router.push('/ratscrew');
      }}
    />
  );
}

/**
 * Multiplayer table. Slap intents ride the shared P2P authority in arrival
 * order; the HOST alone arms `windowClose` after slapWindowMs + grace so a
 * dead race always resumes play (mirroring solo behavior bit-for-bit).
 */
function ActiveMultiplayerRatscrewTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const armedClose = useRef<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const session = ratscrewMultiplayerSession(snapshot);
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

  // Host duty: keep slap windows honest by injecting the authoritative close.
  useEffect(() => {
    if (!snapshot.isHost || !session?.state.window || session.status !== 'playing') {
      armedClose.current = null;
      return;
    }
    const windowKey = `${session.log.length}:${session.state.window.pattern}`;
    if (armedClose.current === windowKey) return;
    armedClose.current = windowKey;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      try {
        room.inject('windowClose');
      } catch {
        // room closing mid-race; the new host re-arms from its own effect
      }
    }, session.state.rules.slapWindowMs + SLAP_GRACE_MS);
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [room, session, snapshot.isHost]);

  useEffect(() => {
    if (!session?.result || localSeat === null || reportedMatch.current) return;
    reportedMatch.current = true;
    const mode = ratscrewModeForRules(session.config);
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
      game: 'ratscrew',
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
      game: 'ratscrew',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/ratscrew/create');
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
      <RatscrewTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const playing = session.status === 'playing';
  const legal =
    playing && localSeat !== null
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
      : [];
  const players = snapshot.seats.map((player) => ({
    seat: player.seat,
    name: player.name,
    avatarId: player.avatarId,
    isBot: player.bot,
  }));
  const partial: Omit<RatscrewSnapshot, never> = {
    players,
    session,
    mode: ratscrewModeForRules(session.config),
    matchWinner: session.result?.winner ?? null,
  };

  return (
    <RatscrewTableScreen
      view={ratscrewTableView(partial, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={false}
      error={localError ?? snapshot.error}
      onFlip={() => dispatch('flip')}
      onSlap={() => dispatch('slap')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/ratscrew');
      }}
    />
  );
}
