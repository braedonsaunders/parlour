'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCode } from '@/lib/rooms/code';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/join.module.css';
import {
  activateMultiplayerSession,
  type MultiplayerGameId,
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

export default function JoinPage() {
  const router = useRouter();
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const linkCode = useSyncExternalStore(subscribeNoop, readLinkCode, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const [roomSession, setRoomSession] = useState<MultiplayerRoomSession | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const code = typed ?? linkCode;

  const submit = useCallback(
    async (code: string) => {
      if (checking) return;
      setChecking(true);
      setError(null);
      const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
      setRoomSession(next);
      try {
        await next.join(code);
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
    void submit(linkCode);
  }, [linkCode, submit]);

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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <Link
        href="/"
        className="pill-soft absolute left-5 top-5 text-sm font-bold text-dusk-100 hover:text-hearth-200"
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
            void submit(code);
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
      <JoinStatus
        session={roomSession}
        fallbackError={error}
        onConnected={(gameId) =>
          router.replace(
            gameId === 'wildpile'
              ? '/wild/table'
              : gameId === 'ratscrew'
                ? '/ratscrew/table'
                : gameId === 'hearts'
                  ? '/hearts/table'
                  : gameId === 'gin'
                    ? '/gin/table'
                    : gameId === 'president'
                      ? '/president/table'
                      : '/table',
          )
        }
      />
      <button
        type="button"
        onClick={() => void submit(code)}
        disabled={code.length !== ROOM_CODE_LENGTH || checking}
        className="btn-fat w-64 text-lg"
      >
        {checking ? 'Knocking…' : 'Pull up a chair'}
      </button>
    </main>
  );
}

function JoinStatus({
  session,
  fallbackError,
  onConnected,
}: {
  session: MultiplayerRoomSession | null;
  fallbackError: string | null;
  onConnected: (gameId: MultiplayerGameId) => void;
}) {
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? subscribeNoop,
    session?.getSnapshot ?? (() => null),
    session?.getSnapshot ?? (() => null),
  );
  useEffect(() => {
    if (snapshot?.localSeat !== null && snapshot?.localSeat !== undefined && snapshot.gameId) {
      onConnected(snapshot.gameId);
    }
  }, [onConnected, snapshot?.gameId, snapshot?.localSeat]);
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
