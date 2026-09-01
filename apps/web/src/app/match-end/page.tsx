'use client';

import { useT } from '@/lib/i18n';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearActiveMultiplayerSession } from '@/app/_multiplayer/roomSession';
import { useHydrated } from '@/components/backgrounds/SceneStage';
import { MatchPodium } from '@/components/celebration/MatchPodium';
import { MatchRivalry } from '@/components/celebration/MatchRivalry';
import { getGame } from '@/lib/games';
import { deriveRivalry, hasRivalryToShow } from '@/lib/match/rivalry';
import { isMultiplayerGameId } from '@/lib/rooms/gameIds';
import { roomSegmentFor, tableRouteFor } from '@/lib/rooms/tableRoute';
import { useAnyActiveRoom } from '@/lib/table/useRoomTable';
import { useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import styles from './matchEnd.module.css';

export default function MatchEndPage() {
  const router = useRouter();
  const t = useT();
  // The snapshot is restored from session storage on a reload, so it must not
  // be read during hydration — the prerendered markup has no match in it.
  const hydrated = useHydrated();
  const stored = useMatchFlowStore((s) => s.lastMatch);
  const snapshot = hydrated ? stored : null;
  const playAgainHandler = useMatchFlowStore((s) => s.playAgain);
  const records = useHistoryStore((s) => s.records);
  const profileAvatarId = useProfileStore((s) => s.avatarId);
  const profileName = useProfileStore((s) => s.name);
  const { room: activeRoom, snapshot: activeRoomSnapshot } = useAnyActiveRoom();
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  const rivalry = useMemo(() => deriveRivalry(records, snapshot?.id), [records, snapshot?.id]);
  // the seat you actually sat in wins over the profile, which may have moved on
  const you = snapshot?.seats.find((seat) => seat.seat === snapshot.localSeat);

  const fallbackRoute = snapshot?.game ? (getGame(snapshot.game).href ?? '/play') : '/play';

  // A rematch is published to the existing room, so every peer follows the
  // fresh playing snapshot—even if only one person needed to press the button.
  useEffect(() => {
    if (!snapshot?.id?.startsWith('multiplayer:')) return;
    if (activeRoomSnapshot?.connection === 'closed') return;
    const gameId = activeRoomSnapshot?.gameId ?? activeRoomSnapshot?.settings?.gameId;
    if (!isMultiplayerGameId(gameId)) return;
    if (activeRoomSnapshot?.session?.status === 'playing') {
      router.replace(tableRouteFor(gameId));
      return;
    }
    // A walkover's "play again" reopens the room as a lobby instead of
    // dealing: there is nobody to deal against yet. Follow it to the screen
    // that can seat somebody — the host back to their lobby, a guest to the
    // join page that adopts the live session.
    if (activeRoomSnapshot?.stage === 'lobby' && activeRoomSnapshot.room) {
      const segment = roomSegmentFor(gameId);
      router.replace(
        activeRoomSnapshot.isHost ? (segment ? `/${segment}/create` : '/create') : '/join',
      );
    }
  }, [activeRoomSnapshot, router, snapshot?.id]);

  const playAgain = useCallback(() => {
    if (rematching) return;
    // The handler is a closure the table registered; a reload leaves the
    // snapshot but not the closure, so fall back to that game's own setup.
    if (playAgainHandler) {
      setRematching(true);
      setRematchError(null);
      try {
        void Promise.resolve(playAgainHandler()).then(
          () => setRematching(false),
          (error: unknown) => {
            setRematching(false);
            setRematchError(error instanceof Error ? error.message : 'The rematch could not start');
          },
        );
      } catch (error) {
        setRematching(false);
        setRematchError(error instanceof Error ? error.message : 'The rematch could not start');
      }
      return;
    }
    router.push(fallbackRoute);
    // `fallbackRoute` is read out of the snapshot above rather than inside the
    // closure: depending on `snapshot?.game` while the body reads `snapshot`
    // makes the compiler infer a broader dependency than the one declared, and
    // it then declines to memoize the component at all.
  }, [fallbackRoute, playAgainHandler, rematching, router]);

  const leaveRoom = useCallback(() => {
    if (!snapshot?.id?.startsWith('multiplayer:') || !activeRoom) return;
    activeRoom.close();
    clearActiveMultiplayerSession();
  }, [activeRoom, snapshot?.id]);

  return (
    <main className={styles.page} data-testid="match-end-page">
      {snapshot ? (
        <>
          <MatchPodium snapshot={snapshot}>
            {hasRivalryToShow(rivalry) && (
              <MatchRivalry
                rivalry={rivalry}
                youName={you?.name?.trim() || profileName.trim() || t('common.you')}
                youAvatarId={you?.avatarId ?? profileAvatarId}
              />
            )}
          </MatchPodium>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={playAgain}
              disabled={rematching}
              aria-busy={rematching}
              className={`btn-fat ${styles.primary}`}
              data-testid="play-again"
            >
              {t('matchEnd.playAgain')}
              {rematching ? '…' : ''}
            </button>
            <Link href="/" onClick={leaveRoom} className={`btn-fat btn-fat--ghost ${styles.back}`}>
              {t('common.back')}
            </Link>
          </div>
          {rematchError ? (
            <p role="alert" className="px-6 text-center text-sm font-semibold text-rose-200">
              {rematchError}
            </p>
          ) : null}
        </>
      ) : (
        <div className={`panel-soft mx-6 max-w-md p-8 text-center ${styles.empty}`}>
          <h1 className="font-display text-2xl font-extrabold text-hearth-50">
            {t('matchEnd.none')}
          </h1>
          <p className="mt-2 text-sm text-dusk-100/85">{t('matchEnd.noneHint')}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/play" className="btn-fat">
              {t('matchEnd.playSolo')}
            </Link>
            <Link href="/" className="btn-fat btn-fat--ghost">
              {t('common.back')}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
