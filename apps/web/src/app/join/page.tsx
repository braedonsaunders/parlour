'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@/lib/rooms/code';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/join.module.css';
import {
  activateMultiplayerSession,
  multiplayerProfile,
  MultiplayerRoomSession,
} from '../_multiplayer/roomSession';

const KEYS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split('');
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
  const [typed, setTyped] = useState<string[]>([]);
  const [roomSession, setRoomSession] = useState<MultiplayerRoomSession | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const chars = typed.length > 0 || !linkCode ? typed : linkCode.split('');

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

  const press = useCallback((key: string) => {
    setError(null);
    setTyped((previous) => (previous.length >= ROOM_CODE_LENGTH ? previous : [...previous, key]));
  }, []);
  const backspace = useCallback(() => {
    setError(null);
    setTyped((previous) =>
      previous.length > 0 ? previous.slice(0, -1) : linkCode ? linkCode.split('').slice(0, -1) : [],
    );
  }, [linkCode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      if (key === 'BACKSPACE' || key === 'DELETE') backspace();
      else if (key === 'ENTER' && chars.length === ROOM_CODE_LENGTH) void submit(chars.join(''));
      else if (/^[A-Z0-9]$/.test(key)) press(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backspace, chars, press, submit]);

  const code = chars.join('');
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
      <div
        className={styles.slots}
        role="textbox"
        aria-label={`Room code, ${chars.length} of ${ROOM_CODE_LENGTH} entered`}
        aria-live="polite"
      >
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => (
          <span key={index} data-filled={index < chars.length} className={styles.slot}>
            {chars[index] ?? ''}
          </span>
        ))}
      </div>
      <div className={styles.keypad} aria-label="Room code keypad">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={chars.length === ROOM_CODE_LENGTH || checking}
            className={styles.key}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          className={styles.key}
          aria-label="Delete last character"
        >
          ⌫
        </button>
      </div>
      <JoinStatus
        session={roomSession}
        fallbackError={error}
        onConnected={() => router.replace('/table')}
      />
      <button
        type="button"
        onClick={() => void submit(code)}
        disabled={chars.length !== ROOM_CODE_LENGTH || checking}
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
  onConnected: () => void;
}) {
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? subscribeNoop,
    session?.getSnapshot ?? (() => null),
    session?.getSnapshot ?? (() => null),
  );
  useEffect(() => {
    if (snapshot?.localSeat !== null && snapshot?.localSeat !== undefined) onConnected();
  }, [onConnected, snapshot?.localSeat]);
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
