'use client';

import { applyPreset } from '@parlour/engine';
import { spadesConfig } from '@parlour/game-spades';
import Link from 'next/link';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { SecurityBadge } from '@/components/multiplayer/TableSecurity';
import { useProfileStore } from '@/stores/profile';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateSpadesRoomPage() {
  const router = useWipeRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useSpadesSetupStore((state) => state.mode);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'spades',
        seats: 4,
        config: applyPreset(spadesConfig, mode),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name]);

  if (!session) return <SpadesLobbyLoading />;
  return <ActiveSpadesLobby session={session} onStarted={() => router.push('/spades/table')} />;
}

function ActiveSpadesLobby({
  session,
  onStarted,
}: {
  session: MultiplayerRoomSession;
  onStarted: () => void;
}) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const room = snapshot.room;

  const leave = () => {
    session.close();
    clearActiveMultiplayerSession();
  };

  if (snapshot.error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="panel-soft max-w-md p-5 text-dusk-50" role="alert">
          {snapshot.error}
        </p>
        <Link href="/spades" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Spades
        </Link>
      </main>
    );
  }
  if (!room) return <SpadesLobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/spades"
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={4}
        isHost
        connection={snapshot.connection === 'closed' ? 'reconnecting' : snapshot.connection}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? 'W' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() => {
          session.start();
          onStarted();
        }}
      />
      <SecurityBadge security={snapshot.security} />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        You sit across from your partner, and Spades needs all four seats filled — share the code
        with three friends before starting. Spades rooms are open replay: every peer can see the
        whole game state, so a modified client could read your hand.
      </p>
    </main>
  );
}

function SpadesLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Marking a spades table…
      </p>
    </main>
  );
}
