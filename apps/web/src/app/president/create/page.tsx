'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { HostRoomMatch } from '@/lib/games/RoomGameTable';
import { useProfileStore } from '@/stores/profile';
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';
import { usePersistHydrated } from '@/stores/usePersistHydrated';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreatePresidentRoomPage() {
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = usePresidentSetupStore((state) => state.mode);
  const seats = usePresidentSetupStore((state) => state.seats);
  const overrides = usePresidentSetupStore((state) => state.overrides);
  const ready = usePersistHydrated(usePresidentSetupStore);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (!ready || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'president',
        seats,
        config: presidentRulesFor(mode, overrides),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name, overrides, ready, seats]);

  if (!ready || !session) return <PresidentLobbyLoading />;
  return (
    <HostRoomMatch session={session}>
      <ActivePresidentLobby session={session} />
    </HostRoomMatch>
  );
}

function ActivePresidentLobby({ session }: { session: MultiplayerRoomSession }) {
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
        <Link href="/president" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to President
        </Link>
      </main>
    );
  }
  if (!room) return <PresidentLobbyLoading />;
  const capacity = snapshot.settings?.seats ?? snapshot.seats.length;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/president"
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <RoomLobby
        snapshot={snapshot}
        code={room.code}
        shareUrl={room.shareUrl}
        isHost
        onAddBot={(seat) => session.addBot(seat)}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? '♛' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onListedChange={(listed) => session.setListed(listed)}
        onStart={() => session.start()}
      />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        This {capacity}-seat ladder starts when every chair fills. Share the code with{' '}
        {capacity - 1} friends — the table seats up to eight.
      </p>
    </main>
  );
}

function PresidentLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Setting the ladder…
      </p>
    </main>
  );
}
