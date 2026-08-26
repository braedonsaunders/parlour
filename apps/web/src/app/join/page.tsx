'use client';

import { useT } from '@/lib/i18n';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  validateRoomHostPubkey,
} from '@/lib/rooms/code';
import { RoomLobby } from '@/components/multiplayer/RoomLobby';
import { RoomGameTable } from '@/lib/games/RoomGameTable';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/join.module.css';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
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
  const t = useT();
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

  const submit = useCallback(
    async (code: string, expectedHost?: string) => {
      if (checking) return;
      const live = getActiveMultiplayerSession();
      if (live) {
        const snap = live.getSnapshot();
        if (snap.connection !== 'closed' && (snap.room || snap.connection === 'connecting')) {
          setRoomSession(live);
          return;
        }
      }
      setChecking(true);
      setError(null);
      const next = new MultiplayerRoomSession(multiplayerProfile(name, avatarId));
      setRoomSession(next);
      try {
        await next.join(code, expectedHost);
        activateMultiplayerSession(next);
      } catch (caught) {
        setError(
          caught instanceof Error ? t('join.unreachable', { code }) : t('join.unreachableGeneric'),
        );
        setRoomSession(null);
      } finally {
        setChecking(false);
      }
    },
    [avatarId, checking, name, t],
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

  if (
    roomSession &&
    snapshot?.stage === 'table' &&
    snapshot.gameId &&
    snapshot.localSeat !== null &&
    snapshot.session
  ) {
    return <RoomGameTable gameId={snapshot.gameId} />;
  }

  if (roomSession && snapshot?.room && snapshot.localSeat !== null) {
    return (
      <GuestLobby
        session={roomSession}
        onLeave={() => {
          roomSession.close();
          clearActiveMultiplayerSession();
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
        {t('common.backArrow')}
      </Link>
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-hearth-50">
          {t('join.heading')}
        </h1>
        <p className="mt-1 text-sm text-dusk-100/85">{t('join.hint')}</p>
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
        aria-label={t('join.codeLabel', { entered: code.length, total: ROOM_CODE_LENGTH })}
        className={styles.codeInput}
      />
      <JoinStatus session={roomSession} fallbackError={error} />
      <button
        type="button"
        // Addressed by test id rather than by label: this button says "Pull up a
        // chair" in five languages and "Knocking…" while it works, and a browser
        // suite that matched on the copy silently found nothing at all.
        data-testid="join-submit"
        onClick={() => void submit(code, typed === null ? linkHost || undefined : undefined)}
        disabled={code.length !== ROOM_CODE_LENGTH || checking}
        className="btn-fat w-64 text-lg"
      >
        {checking ? t('join.knocking') : t('join.submit')}
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
  const t = useT();
  const snapshot = useRoomSnapshot(session);
  const room = snapshot?.room;
  if (!snapshot || !room) return null;

  if (snapshot.connection === 'closed' && snapshot.error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="panel-soft max-w-md p-5 text-dusk-50" role="alert">
          {snapshot.error}
        </p>
        <Link
          href="/"
          onClick={() => {
            session.close();
            clearActiveMultiplayerSession();
          }}
          className="btn-fat btn-fat--ghost"
        >
          {t('common.backArrow')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-8">
      <button
        type="button"
        onClick={onLeave}
        className="pill-soft chrome-nw absolute z-30 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        {t('common.leaveArrow')}
      </button>
      <RoomLobby
        snapshot={snapshot}
        code={room.code}
        shareUrl={room.shareUrl}
        isHost={false}
        seats={snapshot.seats.map((seat) => ({
          seat: seat.seat,
          name: seat.name,
          avatar: seat.bot ? '♠' : '♣',
          bot: seat.bot,
          connected: seat.connected,
        }))}
      />
      <p className="text-center text-sm text-dusk-100/80" role="status">
        {t('join.seated')}
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
  const t = useT();
  const snapshot = useRoomSnapshot(session);
  const message = fallbackError ?? snapshot?.error;
  return (
    <div aria-live="assertive" className="min-h-14 max-w-md">
      {session && !message && (
        <p
          className="pill-soft inline-block animate-pulse px-4 py-2 text-sm text-hearth-200"
          role="status"
        >
          {t('join.connecting')}
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
