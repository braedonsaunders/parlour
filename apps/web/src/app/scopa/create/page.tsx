'use client';

import { applyPreset } from '@parlour/engine';
import { scopaConfig } from '@parlour/game-scopa';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { HostRoomMatch } from '@/lib/games/RoomGameTable';
import { scopaPresetFor } from '@/lib/scopa/modes';
import { useProfileStore } from '@/stores/profile';
import { useScopaSetupStore } from '@/stores/scopaSetup';
import { usePersistHydrated } from '@/stores/usePersistHydrated';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function CreateScopaRoomPage() {
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const mode = useScopaSetupStore((state) => state.mode);
  const seats = useScopaSetupStore((state) => state.seats);
  const ready = usePersistHydrated(useScopaSetupStore);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  const [session, setSession] = useState<MultiplayerRoomSession | null>(null);

  useEffect(() => {
    if (!ready || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    void next
      .create({
        gameId: 'scopa',
        seats,
        config: applyPreset(scopaConfig, scopaPresetFor(mode)),
      })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
  }, [avatarId, mode, name, ready, seats]);

  if (!ready || !session) return <ScopaLobbyLoading />;
  return (
    <HostRoomMatch session={session}>
      <ActiveScopaLobby session={session} />
    </HostRoomMatch>
  );
}

function ActiveScopaLobby({ session }: { session: MultiplayerRoomSession }) {
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
        <Link href="/scopa" onClick={leave} className="btn-fat btn-fat--ghost">
          Back to Scopa
        </Link>
      </main>
    );
  }
  if (!room) return <ScopaLobbyLoading />;
  const capacity = snapshot.settings?.seats ?? snapshot.seats.length;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <Link
        href="/scopa"
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
          avatar: seat.bot ? '●' : '◆',
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onStart={() => session.start()}
      />
      <p className="max-w-xl text-center text-sm text-dusk-100/80">
        This {capacity}-seat table starts when every chair is filled.
        {capacity === 4 || capacity === 6
          ? ' Four and six play as partnerships, seats alternating around the table.'
          : ' Share the code with friends, or fill empty chairs with bots.'}
      </p>
    </main>
  );
}

function ScopaLobbyLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        Laying out the table…
      </p>
    </main>
  );
}
