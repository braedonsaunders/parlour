'use client';

import Link from 'next/link';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { useProfileStore } from '@/stores/profile';
import { useGinSetupStore, ginRulesFor } from '@/stores/ginSetup';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateGinRoomPage() {
  const router = useWipeRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useGinSetupStore((state) => state.mode);
  const overrides = useGinSetupStore((state) => state.overrides);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'gin',
        seats: 2,
        config: ginRulesFor(mode, overrides),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name, overrides]);

  if (!session) return <GinLobbyLoading />;
  return <ActiveGinLobby session={session} onStarted={() => router.push('/gin/table')} />;
}

function ActiveGinLobby({
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
        <Link href="/gin" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Gin
        </Link>
      </main>
    );
  }
  if (!room) return <GinLobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/gin"
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={snapshot.settings?.seats ?? 2}
        isHost
        onAddBot={(seat) => session.addBot(seat)}
        connection={snapshot.connection === 'closed' ? 'reconnecting' : snapshot.connection}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? '♣' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() => session.start().then(onStarted)}
        error={snapshot.error}
      />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        This head-to-head table starts when your opponent pulls up a chair. Share the code — first
        past the target takes the match.
      </p>
    </main>
  );
}

function GinLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Marking a Gin table…
      </p>
    </main>
  );
}
