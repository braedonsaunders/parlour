'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { SecurityBadge } from '@/components/multiplayer/TableSecurity';
import { useProfileStore } from '@/stores/profile';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateCribbageRoomPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useCribbageSetupStore((state) => state.mode);
  const overrides = useCribbageSetupStore((state) => state.overrides);
  const rulesKey = JSON.stringify({ ...cribbageRulesFor(mode, overrides), gamesToWin: 1 });
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({ gameId: 'cribbage', seats: 2, config: JSON.parse(rulesKey) })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, name, rulesKey]);

  if (!session) return <Loading />;
  return <ActiveLobby session={session} onStarted={() => router.push('/cribbage/table')} />;
}

function ActiveLobby({
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
        <Link href="/cribbage" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Cribbage
        </Link>
      </main>
    );
  }
  if (!room) return <Loading />;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/cribbage"
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={2}
        isHost
        connection={snapshot.connection === 'closed' ? 'reconnecting' : snapshot.connection}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? 'P' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() =>
          void session
            .start()
            .then(onStarted)
            .catch(() => undefined)
        }
      />
      <SecurityBadge security={snapshot.security} />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        Share the code with one friend. This room plays a complete race to 121 with deterministic
        host and guest replays.
      </p>
    </main>
  );
}

function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Drilling a friend board…
      </p>
    </main>
  );
}
