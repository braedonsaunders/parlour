'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { MatchPodium } from '@/components/celebration/MatchPodium';
import { MatchRivalry } from '@/components/celebration/MatchRivalry';
import { deriveRivalry, hasRivalryToShow } from '@/lib/match/rivalry';
import { useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';

export default function MatchEndPage() {
  const router = useRouter();
  const snapshot = useMatchFlowStore((s) => s.lastMatch);
  const playAgainHandler = useMatchFlowStore((s) => s.playAgain);
  const records = useHistoryStore((s) => s.records);
  const profileAvatarId = useProfileStore((s) => s.avatarId);
  const profileName = useProfileStore((s) => s.name);

  const rivalry = useMemo(() => deriveRivalry(records, snapshot?.id), [records, snapshot?.id]);
  // the seat you actually sat in wins over the profile, which may have moved on
  const you = snapshot?.seats.find((seat) => seat.seat === snapshot.localSeat);

  const playAgain = useCallback(() => {
    if (playAgainHandler) {
      playAgainHandler();
      return;
    }
    router.push('/play');
  }, [playAgainHandler, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      {snapshot ? (
        <>
          <MatchPodium snapshot={snapshot}>
            {hasRivalryToShow(rivalry) && (
              <MatchRivalry
                rivalry={rivalry}
                youName={you?.name?.trim() || profileName.trim() || 'You'}
                youAvatarId={you?.avatarId ?? profileAvatarId}
              />
            )}
          </MatchPodium>
          <div className="fixed bottom-8 left-0 right-0 z-10 flex justify-center gap-3">
            <button
              type="button"
              onClick={playAgain}
              className="btn-fat w-56 text-lg"
              data-testid="play-again"
            >
              Play again
            </button>
            <Link href="/" className="btn-fat btn-fat--ghost w-32 text-lg">
              Back
            </Link>
          </div>
        </>
      ) : (
        <div className="panel-soft mx-6 max-w-md p-8 text-center">
          <h1 className="font-display text-2xl font-extrabold text-hearth-50">
            No match on record
          </h1>
          <p className="mt-2 text-sm text-dusk-100/85">
            Finish a game at the table and the podium will fill in here.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/play" className="btn-fat">
              Play solo
            </Link>
            <Link href="/" className="btn-fat btn-fat--ghost">
              Back
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
