'use client';

import { applyPreset } from '@parlour/engine';
import { ohhellConfig } from '@parlour/game-ohhell';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { useProfileStore } from '@/stores/profile';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';
import { usePersistHydrated } from '@/stores/usePersistHydrated';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateOhHellRoomPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useOhHellSetupStore((state) => state.mode);
  const seats = useOhHellSetupStore((state) => state.seats);
  const ready = usePersistHydrated(useOhHellSetupStore);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (!ready || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'ohhell',
        seats,
        config: applyPreset(ohhellConfig, mode),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name, ready, seats]);

  if (!ready || !session) return <OhHellLobbyLoading />;
  return <ActiveOhHellLobby session={session} onStarted={() => router.push('/ohhell/table')} />;
}

function ActiveOhHellLobby({
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

  if (snapshot.error && !room) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="panel-soft max-w-md p-5 text-dusk-50" role="alert">
          {snapshot.error}
        </p>
        <Link href="/ohhell" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Oh Hell!
        </Link>
      </main>
    );
  }
  if (!room) return <OhHellLobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/ohhell"
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={snapshot.settings?.seats ?? 4}
        isHost
        onAddBot={(seat) => session.addBot(seat)}
        connection={snapshot.connection === 'closed' ? 'reconnecting' : snapshot.connection}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? 'W' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() => session.start().then(onStarted)}
        error={snapshot.error}
      />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        Share the code until every seat is filled, then deal. A friend room plays one round at the
        size you picked — the full arc is a solo match for now. Oh Hell rooms are open replay: every
        peer can see the whole game state, so a modified client could read your hand.
      </p>
    </main>
  );
}

function OhHellLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Turning a card for trump…
      </p>
    </main>
  );
}
