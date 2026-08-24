'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  validateRoomHostPubkey,
} from '@/lib/rooms/code';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { tableRouteFor } from '@/lib/rooms/tableRoute';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/join.module.css';
import {
  activateMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../_multiplayer/roomSession';

const subscribeNoop = () => () => {};

function readLinkCode(): string {
  const match = /^\/join\/([^/]*)/.exec(window.location.pathname);
  const raw = match?.[1]
    ? decodeURIComponent(match[1])
    : new URLSearchParams(window.location.search).get('code');
  return raw ? normalizeRoomCode(raw).slice(0, ROOM_CODE_LENGTH) : '';
}

function readLinkHost(): string {
  return validateRoomHostPubkey(new URLSearchParams(window.location.search).get('host')) ?? '';
}

function useRoomSnapshot(session: MultiplayerRoomSession | null) {
  return useSyncExternalStore(
    session?.subscribe ?? subscribeNoop,
    session?.getSnapshot ?? (() => null),
    session?.getSnapshot ?? (() => null),
  );
}

export default function JoinPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const linkCode = useSyncExternalStore(subscribeNoop, readLinkCode, () => '');
  const linkHost = useSyncExternalStore(subscribeNoop, readLinkHost, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const [roomSession, setRoomSession] = useState<MultiplayerRoomSession | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const code = typed ?? linkCode;
  const snapshot = useRoomSnapshot(roomSession);

  // Taking a seat only puts you in the room. The table opens when the host
  // deals, which reaches this peer as the opening position — so wait for the
  // stage rather than for a seat, or a guest walks in on a deal that is about
  // to be thrown away.
  useEffect(() => {
    if (snapshot?.stage === 'table' && snapshot.gameId) {
      router.replace(tableRouteFor(snapshot.gameId));
    }
  }, [router, snapshot?.gameId, snapshot?.stage]);

  const submit = useCallback(
    async (code: string, expectedHost?: string) => {
      if (checking) return;
      setChecking(true);
      setError(null);
      const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
      setRoomSession(next);
      try {
        await next.join(code, expectedHost);
        activateMultiplayerSession(next);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? `Could not reach table ${code}. Check the code and your connection.`
            : 'Could not reach that table.',
        );
        setRoomSession(null);
      } finally {
        setChecking(false);
      }
    },
    [avatarId, checking, name],
  );

  useEffect(() => {
    if (autoTried.current || !linkCode) return;
    autoTried.current = true;
    void submit(linkCode, linkHost || undefined);
  }, [linkCode, linkHost, submit]);

  const updateCode = useCallback((raw: string) => {
    setError(null);
    setTyped(
      normalizeRoomCode(raw)
        .split('')
        .filter((character) => ROOM_CODE_ALPHABET.includes(character))
        .join('')
        .slice(0, ROOM_CODE_LENGTH),
    );
  }, []);

  if (roomSession && snapshot?.room && snapshot.localSeat !== null) {
    return (
      <GuestLobby
        session={roomSession}
        onLeave={() => {
          roomSession.close();
          setRoomSession(null);
        }}
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <Link
        href="/"
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Back
      </Link>
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-hearth-50">
          Join a table
        </h1>
        <p className="mt-1 text-sm text-dusk-100/85">
          Type the four characters your friend shared.
        </p>
      </div>
      <input
        type="text"
        value={code}
        onChange={(event) => updateCode(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && code.length === ROOM_CODE_LENGTH && !checking) {
            void submit(code, typed === null ? linkHost || undefined : undefined);
          }
        }}
        maxLength={ROOM_CODE_LENGTH}
        inputMode="text"
        enterKeyHint="go"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={!linkCode}
        disabled={checking}
        data-filled={code.length > 0}
        aria-label={`Room code, ${code.length} of ${ROOM_CODE_LENGTH} entered`}
        className={styles.codeInput}
      />
      <JoinStatus session={roomSession} fallbackError={error} />
      <button
        type="button"
        onClick={() => void submit(code, typed === null ? linkHost || undefined : undefined)}
        disabled={code.length !== ROOM_CODE_LENGTH || checking}
        className="btn-fat w-64 text-lg"
      >
        {checking ? 'Knocking…' : 'Pull up a chair'}
      </button>
    </main>
  );
}

/**
 * Where a guest waits between sitting down and the host dealing.
 *
 * There was nowhere to wait before — the lobby belongs to the create pages,
 * which a guest never visits — so the join page sent it straight to the table
 * on being seated. That is what left one screen playing and the other still in
 * the lobby.
 */
function GuestLobby({
  session,
  onLeave,
}: {
  session: MultiplayerRoomSession;
  onLeave: () => void;
}) {
  const snapshot = useRoomSnapshot(session);
  const room = snapshot?.room;
  if (!snapshot || !room) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <button
        type="button"
        onClick={onLeave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Leave
      </button>
      {snapshot.error && (
        <p className="panel-soft max-w-md px-4 py-2.5 text-sm text-dusk-50" role="alert">
          {snapshot.error}
        </p>
      )}
      <RoomLobby
        code={room.code}
        shareUrl={room.shareUrl}
        capacity={snapshot.settings?.seats ?? snapshot.seats.length}
        isHost={false}
        connection={snapshot.connection === 'closed' ? 'reconnecting' : snapshot.connection}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? '♠' : '♣',
          bot: seat.bot,
          connected: seat.connected,
        }))}
      />
      <p className="text-center text-sm text-dusk-100/80" role="status">
        You have a seat. The table opens when the host deals.
      </p>
    </main>
  );
}

function JoinStatus({
  session,
  fallbackError,
}: {
  session: MultiplayerRoomSession | null;
  fallbackError: string | null;
}) {
  const snapshot = useRoomSnapshot(session);
  const message = fallbackError ?? snapshot?.error;
  return (
    <div aria-live="assertive" className="min-h-14 max-w-md">
      {session && !message && (
        <p
          className="pill-soft inline-block animate-pulse px-4 py-2 text-sm text-hearth-200"
          role="status"
        >
          Connecting securely…
        </p>
      )}
      {message && (
        <p
          className="panel-soft inline-block px-4 py-2.5 text-sm text-dusk-50"
          role="alert"
          data-testid="join-error"
        >
          {message}
        </p>
      )}
    </div>
  );
}
