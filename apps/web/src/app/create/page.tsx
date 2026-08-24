'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { SecurityBadge, SecurityPicker } from '@/components/multiplayer/TableSecurity';
import type { RoomSecurity } from '@/lib/multiplayer';
import { useProfileStore } from '@/stores/profile';
import {
  activateMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../_multiplayer/roomSession';

export default function CreateRoomPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);
  // The tier has to be settled before the room is announced: it is part of the
  // round header every seat signs, so it cannot change once the table is open.
  const [security, setSecurity] = useState<RoomSecurity>('open');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!opening || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({ seats: 2, security })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, name, opening, security]);

  if (!opening) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
        <h1 className="text-2xl font-black text-dusk-50">Open a table</h1>
        <SecurityPicker value={security} supported seats={2} onChange={setSecurity} />
        <button type="button" className="btn-fat" onClick={() => setOpening(true)}>
          Open the table
        </button>
        <Link href="/" className="pill-soft text-sm font-bold text-dusk-100">
          ← Back home
        </Link>
      </main>
    );
  }
  if (!session) return <LobbyLoading />;
  return (
    <ActiveCreateLobby session={session} capacity={2} onStarted={() => router.push('/table')} />
  );
}

function ActiveCreateLobby({
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

  if (snapshot.error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="panel-soft max-w-md p-5 text-dusk-50" role="alert">
          {snapshot.error}
        </p>
        <Link href="/" className="btn-fat btn-fat--ghost">
          Back home
        </Link>
      </main>
    );
  }
  if (!room) return <LobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/"
        onClick={() => session.close()}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
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
          avatar: seat.bot ? '♠' : '♣',
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
      <p className="text-center text-sm text-dusk-100/80">
        Share the code with a friend. The match unlocks when a second player sits down.
      </p>
    </main>
  );
}

function LobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Lighting the table…
      </p>
    </main>
  );
}
