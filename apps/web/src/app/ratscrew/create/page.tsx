'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { SecurityBadge } from '@/components/multiplayer/TableSecurity';
import { useProfileStore } from '@/stores/profile';
import { useRatscrewSetupStore, ratscrewRulesFor } from '@/stores/ratscrewSetup';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateRatscrewRoomPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useRatscrewSetupStore((state) => state.mode);
  const seats = useRatscrewSetupStore((state) => state.seats);
  const overrides = useRatscrewSetupStore((state) => state.overrides);
  const rulesKey = JSON.stringify(ratscrewRulesFor(mode, overrides));
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'ratscrew',
        seats,
        config: JSON.parse(rulesKey),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, name, rulesKey, seats]);

  if (!session) return <LobbyLoading />;
  return (
    <ActiveLobby
      session={session}
      capacity={seats}
      onStarted={() => router.push('/ratscrew/table')}
    />
  );
}

function ActiveLobby({
  session,
  capacity,
  onStarted,
}: {
  session: MultiplayerRoomSession;
  capacity: number;
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
        <Link href="/ratscrew" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Rat Screw
        </Link>
      </main>
    );
  }
  if (!room) return <LobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/ratscrew"
        onClick={leave}
        className="pill-soft absolute left-5 top-5 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={capacity}
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
          void session
            .start()
            .then(onStarted)
            .catch(() => undefined);
        }}
      />
      <SecurityBadge security={snapshot.security} />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        Slaps resolve in arrival order on the host — first palm on the pile takes it. This{' '}
        {capacity}-seat table starts when every chair is filled.
      </p>
    </main>
  );
}

function LobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Marking a Rat Screw table…
      </p>
    </main>
  );
}
