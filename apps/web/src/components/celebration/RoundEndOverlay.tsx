'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FxEvent } from '@parlour/engine';
import { stateHash } from '@parlour/engine';
import {
  buildRoundEndPlan,
  type ChipLossStep,
  type RevealStep,
  type RoundEndPlan,
} from '@/lib/match/roundEnd';
import type { SeatInfo } from '@/lib/seats';
import { getAvatar } from '@/lib/avatars';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { BLITZ_SFX, PARLOUR_SFX } from '@/lib/audio/sfx';
import { AvatarBadge } from '@/components/AvatarBadge';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/celebrate.module.css';

export interface RoundEndOverlayProps {
  /** The round's fx tail — the ONLY driver of this choreography (spec §4.1). */
  fx: readonly FxEvent[];
  seats: readonly SeatInfo[];
  /** Lives per seat after the round; seats without a chip.loss keep theirs. */
  livesBySeat: Record<number, number>;
  /** Fired once when the auto-deal countdown expires (spec caps the wait at 4 s). */
  onNextRound: () => void;
}

interface Progress {
  revealed: readonly RevealStep[];
  banner: boolean;
  losses: readonly ChipLossStep[];
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** True when motion should calm down: system preference OR the profile comfort toggle. */
export function useRoundEndReducedMotion(): boolean {
  const profileReduced = useProfileStore((s) => s.settings.reducedMotion);
  const mediaReduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
  return profileReduced || mediaReduced;
}

/**
 * Remounts the choreography whenever a new round's fx tail arrives, so each
 * round starts its timeline from scratch without effect-driven state resets.
 */
export function RoundEndOverlay(props: RoundEndOverlayProps) {
  const key = useMemo(() => stateHash(props.fx), [props.fx]);
  return <RoundEndChoreography key={key} {...props} />;
}

function RoundEndChoreography({ fx, seats, livesBySeat, onNextRound }: RoundEndOverlayProps) {
  const plan = useMemo(() => buildRoundEndPlan(fx), [fx]);
  const reducedMotion = useRoundEndReducedMotion();

  const [progress, setProgress] = useState<Progress>({ revealed: [], banner: false, losses: [] });
  const [jumpedToEnd, setJumpedToEnd] = useState(false);

  const collapsed = Boolean(plan) && (reducedMotion || jumpedToEnd);
  const shownProgress: Progress =
    plan && collapsed
      ? { revealed: plan.reveals, banner: true, losses: plan.chipLosses }
      : progress;

  const firedRef = useRef(false);

  useEffect(() => {
    if (!plan) return;

    firedRef.current = false;
    const scheduled: number[] = [];
    const schedule = (fn: () => void, delayMs: number) => {
      scheduled.push(window.setTimeout(fn, Math.max(0, delayMs)));
    };
    const finishOnce = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onNextRound();
    };

    if (collapsed) {
      // Motion is calm or skipped: standings are already final via derivation;
      // only the auto-deal handoff remains.
      schedule(finishOnce, Math.min(600, plan.nextReadyAtMs));
      return () => clearTimeouts(scheduled);
    }

    const audio = getAudioManager();
    if (plan.kind === 'blitz') audio.play(BLITZ_SFX.fanfare);

    for (const reveal of plan.reveals) {
      schedule(() => {
        audio.play(PARLOUR_SFX.cardFlip);
        setProgress((p) =>
          p.revealed.some((r) => r.seat === reveal.seat)
            ? p
            : { ...p, revealed: [...p.revealed, reveal] },
        );
      }, reveal.atMs);
    }

    schedule(() => {
      if (plan.kind !== 'blitz') audio.play(PARLOUR_SFX.turnReady);
      setProgress((p) => ({ ...p, banner: true }));
    }, plan.bannerAtMs);

    for (const loss of plan.chipLosses) {
      schedule(() => {
        audio.play(BLITZ_SFX.lifeLoss);
        setProgress((p) =>
          p.losses.some((l) => l.seat === loss.seat) ? p : { ...p, losses: [...p.losses, loss] },
        );
      }, loss.atMs);
    }

    schedule(finishOnce, plan.nextReadyAtMs);

    return () => clearTimeouts(scheduled);
  }, [plan, onNextRound, collapsed]);

  if (!plan) return null;

  const skipped = collapsed;

  return (
    <div className={styles.overlay} data-testid="round-end-overlay">
      <button
        type="button"
        className={styles.skipVeil}
        onClick={() => setJumpedToEnd(true)}
        disabled={skipped}
        aria-label="Skip to final standings"
      />

      <section className={styles.stage} aria-live="polite">
        {shownProgress.banner && <ResultBanner plan={plan} seats={seats} />}

        <div className={styles.revealRow}>
          {plan.reveals.map((reveal) => (
            <RevealCard
              key={reveal.seat}
              reveal={reveal}
              shown={shownProgress.revealed.includes(reveal)}
              seats={seats}
            />
          ))}
        </div>

        <div className={styles.standings} data-testid="standings">
          {seats.map((info) => (
            <StandingRow
              key={info.seat}
              info={info}
              livesBySeat={livesBySeat}
              loss={shownProgress.losses.find((l) => l.seat === info.seat)}
            />
          ))}
        </div>

        {shownProgress.banner && (
          <div className={styles.countdownWrap}>
            <span
              key={`${plan.nextReadyAtMs}-${plan.bannerAtMs}`}
              className={styles.countdownRing}
              style={{
                animationDuration: `${Math.max(400, plan.nextReadyAtMs - plan.bannerAtMs)}ms`,
              }}
            />
            <span className={styles.countdownLabel}>next hand…</span>
          </div>
        )}
      </section>
    </div>
  );
}

function StandingRow({
  info,
  livesBySeat,
  loss,
}: {
  info: SeatInfo;
  livesBySeat: Record<number, number>;
  loss: ChipLossStep | undefined;
}) {
  const avatar = getAvatar(info.avatarId);
  const name = info.name.trim() || avatar.name;
  const livesBefore = livesBySeat[info.seat];
  const lives = loss ? loss.livesLeft : (livesBefore ?? 0);
  const lostThisRound = Boolean(loss) && typeof livesBefore === 'number' && lives < livesBefore;
  return (
    <div
      className={styles.standingRow}
      data-lost={lostThisRound || undefined}
      style={{ ['--seat-accent' as string]: avatar.accent }}
    >
      <AvatarBadge avatarId={info.avatarId} size={30} />
      <span className={styles.standingName}>{name}</span>
      {lostThisRound && <span className={styles.delta}>−1</span>}
      <span className={styles.lifePips} aria-label={`${lives} lives left`}>
        {Array.from({ length: clampPips(lives) }, (_, i) => (
          <i key={i} />
        ))}
        {lives <= 0 && <em>out</em>}
      </span>
    </div>
  );
}

function clampPips(lives: number): number {
  return Math.max(0, Math.min(5, lives));
}

function ResultBanner({ plan, seats }: { plan: RoundEndPlan; seats: readonly SeatInfo[] }) {
  const actor = seats.find((s) => s.seat === plan.actorSeat);
  const actorName = actor?.name.trim() || 'Someone';
  return (
    <div className={styles.banner} data-kind={plan.kind}>
      {plan.kind === 'blitz' && <span className={styles.blitzNumeral}>31</span>}
      <h2 className={styles.bannerText}>
        {plan.kind === 'knock' && 'KNOCKED!'}
        {plan.kind === 'blitz' && 'BLITZ!'}
        {plan.kind === 'showdown' && 'SHOWDOWN'}
      </h2>
      <p className={styles.bannerSub}>
        {plan.kind === 'knock' && `${actorName} knocked — one last turn each`}
        {plan.kind === 'blitz' && `${actorName} hit 31 out of nowhere`}
        {plan.kind === 'showdown' && 'Hands are up — count them'}
      </p>
    </div>
  );
}

function RevealCard({
  reveal,
  shown,
  seats,
}: {
  reveal: RevealStep;
  shown: boolean;
  seats: readonly SeatInfo[];
}) {
  const info = seats.find((s) => s.seat === reveal.seat);
  if (!info) return null;
  const avatar = getAvatar(info.avatarId);
  const name = info.name.trim() || avatar.name;
  return (
    <div
      className={styles.revealCard}
      data-shown={shown}
      style={{ ['--seat-accent' as string]: avatar.accent }}
    >
      <AvatarBadge avatarId={info.avatarId} size={40} />
      <span className={styles.revealName}>{name}</span>
      <span className={styles.revealValue}>{shown ? reveal.handValue : '?'}</span>
    </div>
  );
}

function clearTimeouts(timers: number[]): void {
  for (const timer of timers) window.clearTimeout(timer);
}
