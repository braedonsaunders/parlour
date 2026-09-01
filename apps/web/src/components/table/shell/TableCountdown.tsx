'use client';

import { useEffect, useState } from 'react';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { prefersCalmMotion } from '@/lib/table/calm-motion';
import { OPENING_COUNTDOWN_LEAD_MS } from '@/lib/table/opening-countdown';
import { useProfileStore } from '@/stores/profile';
import styles from '@/styles/table.module.css';

/**
 * The shared 3·2·1 that opens every table, solo or with friends.
 *
 * Purely presentational: it runs over the opening deal rather than delaying
 * it, so no game's fx timeline had to learn about it — by "1" the cards are
 * mostly down and "Deal!" lands as the table becomes playable. Each beat is a
 * clock tick; the release is the turn-ready chime. Calm-motion players skip
 * it entirely — a full-screen numeral is exactly what they turned off.
 */
const STEPS = ['3', '2', '1', 'Deal!'] as const;
/** Three beats fill the opening-fx hold exactly, so "Deal!" lands on card one. */
const BEAT_MS = OPENING_COUNTDOWN_LEAD_MS / 3;
const RELEASE_MS = 700;
/** One extra beat after "Deal!" where the veil fades instead of vanishing. */
const VEIL_OUT_MS = 320;

export function TableCountdown() {
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const [step, setStep] = useState(0);
  const [skipped] = useState(() => prefersCalmMotion());

  const leaving = step === STEPS.length;
  const done = skipped || reducedMotion || step > STEPS.length;

  useEffect(() => {
    if (done) return;
    if (!leaving) {
      getAudioManager().play(
        step === STEPS.length - 1 ? PARLOUR_SFX.turnReady : PARLOUR_SFX.clockTick,
      );
    }
    const timer = window.setTimeout(
      () => setStep((current) => current + 1),
      leaving ? VEIL_OUT_MS : step === STEPS.length - 1 ? RELEASE_MS : BEAT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [done, leaving, step]);

  if (done) return null;

  const label = STEPS[step] ?? '';
  return (
    <div
      className={styles.countdown}
      aria-hidden="true"
      data-testid="table-countdown"
      data-leaving={leaving || undefined}
    >
      {!leaving && (
        <span
          key={step}
          className={styles.countdownDigit}
          data-final={step === STEPS.length - 1 || undefined}
        >
          {label}
        </span>
      )}
    </div>
  );
}
