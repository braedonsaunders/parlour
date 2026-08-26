'use client';

import { applyPreset } from '@parlour/engine';
import { pokerConfig } from '@parlour/game-poker';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { HostRoomMatch } from '@/lib/games/RoomGameTable';
import { useProfileStore } from '@/stores/profile';
import { usePokerSetupStore } from '@/stores/pokerSetup';
import { usePersistHydrated } from '@/stores/usePersistHydrated';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreatePokerRoomPage() {
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = usePokerSetupStore((state) => state.mode);
  const seats = usePokerSetupStore((state) => state.seats);
  const ready = usePersistHydrated(usePokerSetupStore);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (!ready || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'poker',
        seats,
        config: applyPreset(pokerConfig, mode),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name, ready, seats]);

  if (!ready || !session) return <PokerLobbyLoading />;
  return (
    <HostRoomMatch session={session}>
      <ActivePokerLobby session={session} />
    </HostRoomMatch>
  );
}

function ActivePokerLobby({ session }: { session: MultiplayerRoomSession }) {
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
        <Link href="/poker" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Poker
        </Link>
      </main>
    );
  }
  if (!room) return <PokerLobbyLoading />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/poker"
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
          avatar: seat.bot ? 'W' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() => session.start()}
      />
    </main>
  );
}

function PokerLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Setting out the chips…
      </p>
    </main>
  );
}
