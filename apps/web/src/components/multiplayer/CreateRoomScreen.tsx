'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LobbyChrome } from '@/components/multiplayer/LobbyChrome';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { HostRoomMatch } from '@/lib/games/RoomGameTable';
import { createScreenFor, type CreateScreen } from '@/lib/rooms/createScreens';
import type { MultiplayerGameId } from '@/lib/rooms/gameIds';
import { useProfileStore } from '@/stores/profile';
import { usePersistHydrated } from '@/stores/usePersistHydrated';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '@/app/_multiplayer/roomSession';

/**
 * The host's side of opening a friend room, for every game.
 *
 * This is a straight lift of what all fourteen create pages already did, with
 * the parts that differed moved into {@link CREATE_SCREENS}. It renders the same
 * markup, in the same order, with the same classes: the point of the collapse
 * was to stop maintaining one screen fourteen times, not to redesign it.
 */
export function CreateRoomScreen({ gameId }: { gameId: MultiplayerGameId }) {
  const screen = createScreenFor(gameId);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const ready = usePersistHydrated(screen.hydrate);
  const sessionRef = useRef<MultiplayerRoomSession | null>(null);
  // A live room this profile already hosts is adopted, not replaced: a
  // walkover's "play again" reopens the room as a lobby and routes back
  // here, and a host reloading this page mid-lobby is the same story. The
  // old behaviour minted a fresh room and orphaned the one whose code
  // everyone was holding.
  const [session, setSession] = useState<MultiplayerRoomSession | null>(() => {
    const active = getActiveMultiplayerSession();
    const held = active?.getSnapshot();
    const adoptable =
      active &&
      held &&
      held.isHost &&
      held.stage === 'lobby' &&
      held.room &&
      held.connection !== 'closed' &&
      (held.gameId ?? held.settings?.gameId) === gameId;
    return adoptable ? active : null;
  });

  useEffect(() => {
    // An adopted room only needs the ref that stops a second one being made.
    if (session && !sessionRef.current) {
      sessionRef.current = session;
      return;
    }
    if (!ready || sessionRef.current) return;
    const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
    sessionRef.current = next;
    setSession(next);
    const { seats, config } = screen.room();
    void next
      .create({ gameId, seats, config })
      .then(() => activateMultiplayerSession(next))
      .catch(() => undefined);
    // `screen` is a stable module constant and the room is read once inside,
    // which is why the rule values are not dependencies here. Each old page
    // listed its own — and then guarded the body so a change could never open a
    // second room, so the dependency never did anything but re-run a no-op.
  }, [avatarId, gameId, name, ready, screen, session]);

  if (!ready || !session) return <CreateRoomLoading screen={screen} />;
  return (
    <HostRoomMatch session={session}>
      <ActiveLobby session={session} screen={screen} />
    </HostRoomMatch>
  );
}

function ActiveLobby({
  session,
  screen,
}: {
  session: MultiplayerRoomSession;
  screen: CreateScreen;
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
        <Link href={screen.backHref} onClick={leave} className="btn-fat btn-fat--ghost">
          {screen.backLabel}
        </Link>
      </main>
    );
  }
  if (!room) return <CreateRoomLoading screen={screen} />;
  const capacity = snapshot.settings?.seats ?? snapshot.seats.length;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8 shortscape:gap-2 shortscape:pb-8 shortscape:pt-14">
      <Link
        href={screen.backHref}
        onClick={leave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </Link>
      <LobbyChrome />
      <RoomLobby
        snapshot={snapshot}
        code={room.code}
        shareUrl={room.shareUrl}
        isHost
        onAddBot={(seat) => session.addBot(seat)}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? screen.botGlyph : screen.humanGlyph,
          bot: seat.bot,
          connected: seat.connected,
        }))}
        onListedChange={(listed) => session.setListed(listed)}
        onStart={() => session.start()}
      />
      {screen.blurb && (
        <p className="max-w-xl text-center text-sm text-dusk-100/80 shortscape:hidden">
          {screen.blurb(capacity)}
        </p>
      )}
    </main>
  );
}

function CreateRoomLoading({ screen }: { screen: CreateScreen }) {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="panel-soft animate-pulse px-5 py-3 font-bold text-hearth-100">
        {screen.loading}
      </p>
    </main>
  );
}
