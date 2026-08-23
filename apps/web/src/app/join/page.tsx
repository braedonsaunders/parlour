'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@/lib/rooms/code';
import { attemptJoin, type JoinOutcome } from '@/lib/rooms/join';
import styles from '@/styles/join.module.css';

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
  // Deep link (/join/CODE): read as an external store so SSR/hydration stay safe.
  const linkCode = useSyncExternalStore(subscribeNoop, readLinkCode, () => '');
  const [typed, setTyped] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const autoTried = useRef(false);

  const chars = typed.length > 0 || !linkCode ? typed : linkCode.split('');

  const submit = useCallback(async (code: string) => {
    setChecking(true);
    setOutcome(null);
    try {
      const result = await attemptJoin(code);
      if (result.ok) return;
      setOutcome(result);
      if (result.reason === 'bad-format') setTyped([]);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (autoTried.current || !linkCode) return;
    autoTried.current = true;
    void submit(linkCode);
  }, [linkCode, submit]);

  const press = useCallback((key: string) => {
    setOutcome(null);
    setTyped((prev) => (prev.length >= ROOM_CODE_LENGTH ? prev : [...prev, key]));
  }, []);

  const backspace = useCallback(() => {
    setOutcome(null);
    setTyped((prev) => {
      if (prev.length > 0) return prev.slice(0, -1);
      // Editing straight from a deep-linked code: seed from it.
      return linkCode ? linkCode.split('').slice(0, -1) : [];
    });
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
  }, [chars, submit, press, backspace]);

  const code = chars.join('');
  const full = chars.length === ROOM_CODE_LENGTH;

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
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => (
          <span key={i} data-filled={i < chars.length} className={styles.slot}>
            {chars[i] ?? ''}
          </span>
        ))}
      </div>

      <div className={styles.keypad} aria-label="Room code keypad">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={full}
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

      <div aria-live="assertive" className="min-h-14 max-w-md">
        {checking && (
          <p
            className="pill-soft inline-block animate-pulse px-4 py-2 text-sm text-hearth-200"
            role="status"
          >
            Knocking on table {code}…
          </p>
        )}
        {!checking && outcome && !outcome.ok && (
          <p
            className="panel-soft inline-block px-4 py-2.5 text-sm text-dusk-50"
            role="alert"
            data-testid="join-error"
          >
            {outcome.message}
            <Link
              href="/play"
              className="ml-2 font-bold text-hearth-300 underline decoration-dotted"
            >
              Play solo instead →
            </Link>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void submit(code)}
        disabled={!full || checking}
        className="btn-fat w-64 text-lg"
      >
        Pull up a chair
      </button>
    </main>
  );
}
