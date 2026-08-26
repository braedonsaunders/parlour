'use client';

import { useT } from '@/lib/i18n';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useHydrated } from '@/components/backgrounds/SceneStage';
import { MatchPodium } from '@/components/celebration/MatchPodium';
import { MatchRivalry } from '@/components/celebration/MatchRivalry';
import { getGame } from '@/lib/games';
import { deriveRivalry, hasRivalryToShow } from '@/lib/match/rivalry';
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

  const rivalry = useMemo(() => deriveRivalry(records, snapshot?.id), [records, snapshot?.id]);
  // the seat you actually sat in wins over the profile, which may have moved on
  const you = snapshot?.seats.find((seat) => seat.seat === snapshot.localSeat);

  const fallbackRoute = snapshot?.game ? (getGame(snapshot.game).href ?? '/play') : '/play';

  const playAgain = useCallback(() => {
    // The handler is a closure the table registered; a reload leaves the
    // snapshot but not the closure, so fall back to that game's own setup.
    if (playAgainHandler) {
      playAgainHandler();
      return;
    }
    router.push(fallbackRoute);
    // `fallbackRoute` is read out of the snapshot above rather than inside the
    // closure: depending on `snapshot?.game` while the body reads `snapshot`
    // makes the compiler infer a broader dependency than the one declared, and
    // it then declines to memoize the component at all.
  }, [fallbackRoute, playAgainHandler, router]);

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
              className={`btn-fat ${styles.primary}`}
              data-testid="play-again"
            >
              {t('matchEnd.playAgain')}
            </button>
            <Link href="/" className={`btn-fat btn-fat--ghost ${styles.back}`}>
              {t('common.back')}
            </Link>
          </div>
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
