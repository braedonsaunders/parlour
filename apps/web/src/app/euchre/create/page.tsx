'use client';

import { applyPreset } from '@parlour/engine';
import { euchreConfig } from '@parlour/game-euchre';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { useProfileStore } from '@/stores/profile';
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateEuchreRoomPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useEuchreSetupStore((state) => state.mode);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'euchre',
        seats: 4,
        config: applyPreset(euchreConfig, mode),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name]);

  if (!session) return <EuchreLobbyLoading />;
  return <ActiveEuchreLobby session={session} onStarted={() => router.push('/euchre/table')} />;
}

function ActiveEuchreLobby({
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
        <Link href="/euchre" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Euchre
        </Link>
      </main>
    );
  }
  if (!room) return <EuchreLobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/euchre"
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
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        You sit across from your partner. Share the code with three friends — empty chairs play as
        bots until their owners reclaim them.
      </p>
    </main>
  );
}

function EuchreLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Marking a euchre table…
      </p>
    </main>
  );
}
