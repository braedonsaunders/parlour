'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import type { MatchSnapshot } from '@/stores/matchFlow';
import { derivePodium } from '@/lib/match/podium';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { AvatarBadge } from '@/components/AvatarBadge';
import styles from '@/styles/podium.module.css';

const RANK_MEDALS = ['#ffd9a0', '#cfd8dc', '#e2a07c'] as const;

export function MatchPodium({
  snapshot,
  children,
}: {
  snapshot: MatchSnapshot;
  /** Rendered inside the stage under the plaques — standings, extra flourishes. */
  children?: ReactNode;
}) {
  const entries = useMemo(
    () => derivePodium(snapshot.result, snapshot.seats),
    [snapshot.result, snapshot.seats],
  );

  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
      timeline.from(`.${styles.headline}`, { scale: 0.5, opacity: 0, duration: 0.3 });
      timeline.from(
        `.${styles.plaque}`,
        {
          y: 64,
          opacity: 0,
          duration: 0.42,
          stagger: 0.09,
        },
        '-=0.05',
      );
      timeline.from(`.${styles.statsRow}`, { opacity: 0, duration: 0.24 }, '-=0.1');
      timeline.fromTo(
        `.${styles.coin}`,
        { y: -40, x: (i: number) => ((i % 7) - 3) * 14, opacity: 0 },
        {
          y: () => gsap.utils.random(160, 320),
          rotation: () => gsap.utils.random(-220, 220),
          opacity: 1,
          duration: () => gsap.utils.random(0.9, 1.5),
          ease: 'power1.in',
          stagger: { from: 'random', each: 0.03 },
        },
        '-=0.15',
      );
      timeline.to(`.${styles.coin}`, { opacity: 0, duration: 0.4 }, '>0.6');
    }, stage);

    return () => ctx.revert();
  }, [entries.length]);

  const winner = entries.find((entry) => entry.isWinner) ?? null;
  const winnerName = winner?.seat === snapshot.localSeat ? 'You' : winner?.name;
  const localWon =
    snapshot.localSeat === null ? true : winner !== null && winner.seat === snapshot.localSeat;

  const audio = getAudioManager();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      audio.play(localWon ? PARLOUR_SFX.matchWin : PARLOUR_SFX.matchLose);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [audio, localWon]);

  return (
    <div ref={stageRef} className={styles.stage} data-testid="match-podium">
      <header className={styles.headline}>
        <p className={styles.overline}>{snapshot.result.reason.replace(/-/g, ' ')}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-hearth-50 sm:text-5xl">
          {winner ? (
            <>
              <span data-testid="winner-name">{winnerName}</span> won the match
            </>
          ) : (
            'Match complete'
          )}
        </h1>
        <p className={styles.modeLine}>{modeLine(snapshot)}</p>
      </header>

      <ol className={styles.plaqueRow}>
        {entries.map((entry, index) => (
          <li
            key={entry.seat}
            className={styles.plaque}
            data-winner={entry.isWinner || undefined}
            style={{ ['--plaque-accent' as string]: entry.accent }}
            data-testid={`podium-${entry.rank}`}
          >
            {entry.isWinner && (
              <span className={styles.coinField} aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} className={styles.coin} style={{ left: `${(i % 8) * 12 + 4}%` }} />
                ))}
              </span>
            )}
            <span
              className={styles.medal}
              style={{ background: RANK_MEDALS[index] ?? 'rgba(175,218,228,0.35)' }}
            >
              {ordinal(entry.rank)}
            </span>
            <AvatarBadge avatarId={avatarOf(snapshot, entry.seat)} size={56} />
            <span className={styles.plaqueName}>
              {entry.name}
              {entry.seat === snapshot.localSeat && ' (you)'}
            </span>
            <dl className={styles.statsRow}>
              {snapshot.game === 'euchre' ? (
                <div>
                  <dt>Team score</dt>
                  <dd>{teamScoreOf(snapshot, entry.seat)}</dd>
                </div>
              ) : snapshot.game === 'wild' ? (
                <div>
                  <dt>Cards left</dt>
                  <dd>{entry.cardsLeft ?? 0}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>Blitzes</dt>
                    <dd>{entry.blitzes}</dd>
                  </div>
                  <div>
                    <dt>Knock wins</dt>
                    <dd>{entry.knockWins}</dd>
                  </div>
                  {entry.livesLeft !== null && (
                    <div>
                      <dt>Lives</dt>
                      <dd>{entry.livesLeft}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </li>
        ))}
      </ol>

      {children}
    </div>
  );
}

function teamScoreOf(snapshot: MatchSnapshot, seat: number): number {
  const detail = snapshot.result.rankings.find((rank) => rank.seat === seat)?.detail;
  const score = detail && typeof detail === 'object' && 'score' in detail
    ? (detail as { score?: unknown }).score
    : undefined;
  return typeof score === 'number' ? score : 0;
}

function modeLine(snapshot: MatchSnapshot): string {
  if (snapshot.game === 'euchre') {
    return `Euchre · ${typeof snapshot.mode === 'string' ? snapshot.mode.replace('-', ' ') : 'classic pub'}`;
  }
  if (snapshot.game === 'wild') {
    return snapshot.mode === 'party' ? 'Wild · party pile' : 'Wild · classic pile';
  }
  switch (snapshot.mode) {
    case 'classic':
      return 'Classic · lives';
    case 'fast':
      return 'Fast · first to the pot';
    case 'timed':
      return 'Timed · against the clock';
    default:
      return 'House game';
  }
}

function avatarOf(snapshot: MatchSnapshot, seat: number): string {
  return snapshot.seats.find((info) => info.seat === seat)?.avatarId ?? 'ember';
}

function ordinal(rank: number): string {
  switch (rank) {
    case 1:
      return '1st';
    case 2:
      return '2nd';
    case 3:
      return '3rd';
    default:
      return `${rank}th`;
  }
}
