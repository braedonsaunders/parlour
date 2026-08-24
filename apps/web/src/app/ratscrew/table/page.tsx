'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import type { FxEvent } from '@parlour/engine';
import { RatscrewTableScreen } from '@/components/table/ratscrew/RatscrewTableScreen';
import { RatscrewTransport, type RatscrewSnapshot } from '@/lib/solo/RatscrewTransport';
import { SLAP_GRACE_MS } from '@parlour/game-ratscrew';
import { ratscrewModeForRules } from '@/lib/ratscrew/modes';
import { ratscrewTableView } from '@/lib/ratscrew/view';
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
import { useRatscrewSetupStore, ratscrewRulesFor } from '@/stores/ratscrewSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { RatscrewConfig, RatscrewState } from '@parlour/game-ratscrew';

export default function RatscrewTablePage() {
  const room = useMultiplayerRoom('ratscrew');
  if (room) return <ActiveMultiplayerRatscrewTable room={room} />;
  return <SoloRatscrewTablePage />;
}

function SoloRatscrewTablePage() {
  const mode = useRatscrewSetupStore((state) => state.mode);
  const seats = useRatscrewSetupStore((state) => state.seats);
  const overrides = useRatscrewSetupStore((state) => state.overrides);
  const botTier = useRatscrewSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const rules = ratscrewRulesFor(mode, overrides);
  const rulesKey = JSON.stringify(rules);

  const transport = useSoloTransport(
    () =>
      new RatscrewTransport({
        seats,
        seed: Date.now() | 0,
        rules: JSON.parse(rulesKey) as typeof rules,
        player: { name, avatarId },
        botTier,
      }),
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    [avatarId, botTier, name, rulesKey, seats],
    (built) => built.dispose(),
  );

  if (!transport) return <RatscrewTableScreen view={null} fx={[]} fxKey="loading" />;
  return <LiveRatscrewTable transport={transport} />;
}

/** Drives the UI off the transport's real-time notifications. */
function LiveRatscrewTable({ transport }: { transport: RatscrewTransport }) {
  const router = useWipeRouter();
  const [, setTick] = useState(0);
  const [fx, setFx] = useState<readonly FxEvent[]>(
    () => transport.getSnapshot().session.setupFx ?? [],
  );
  const [fxKey, setFxKey] = useState(0);

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

  useMatchReport({
    result: snapshot.matchWinner === null ? null : (snapshot.session.result ?? null),
    game: 'ratscrew',
    mode: ratscrewModeForRules(snapshot.session.config),
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:ratscrew:${snapshot.session.seed}`,
    won: snapshot.matchWinner === 0,
    playAgain: () => router.push('/ratscrew/table'),
  });

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
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const armedClose = useRef<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const session = multiplayerSession<RatscrewState, RatscrewConfig>(snapshot, 'ratscrew');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? ratscrewModeForRules(session.config) : 'classic';

  const { dispatch, error: localError } = useRoomDispatch(room);

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

  useMatchReport({
    result: session?.result ?? null,
    game: 'ratscrew',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/ratscrew/create'),
    onLeave: () => leaveRoom(room),
  });

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
        leaveRoom(room);
        router.push('/ratscrew');
      }}
    />
  );
}
