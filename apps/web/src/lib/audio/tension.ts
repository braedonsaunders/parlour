'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Clock-driven mood trigger for games whose tension is about time running out:
 * the cue arms once a match has been running for `expectedMs - windowMs`, and
 * stays armed for anything played past the pace (an overlong hand is, if
 * anything, tenser). Games with a real countdown pass their own numbers; games
 * that only have a typical length — Wild's one deal — pass that.
 *
 * This is presentation only: the clock is wall time in the browser, never engine
 * state, so replays and the seeded reducer stay untouched.
 */
export const DEFAULT_TENSE_WINDOW_MS = 60_000;

export type TenseWindow = {
  /** Match length the cue is measured against (real countdown or typical pace). */
  expectedMs: number;
  /** How long before the end the cue arms. */
  windowMs?: number;
};

export function tenseThresholdMs({ expectedMs, windowMs }: TenseWindow): number {
  return Math.max(0, expectedMs - (windowMs ?? DEFAULT_TENSE_WINDOW_MS));
}

export function isTenseAt(elapsedMs: number, window: TenseWindow): boolean {
  return elapsedMs >= tenseThresholdMs(window);
}

export type MatchTensionOptions = TenseWindow & {
  /** The clock only runs while the match is live; false releases the cue. */
  running: boolean;
  /** Changing this restarts the clock (new match, new hand). */
  resetKey?: string | number;
};

const TICK_MS = 1_000;

/** True once the running match reaches its final `windowMs`; false when it ends. */
export function useMatchTension(options: MatchTensionOptions): boolean {
  const { expectedMs, windowMs, running, resetKey } = options;
  const threshold = tenseThresholdMs({ expectedMs, windowMs });
  const elapsedMs = useRef(0);
  const [reached, setReached] = useState({ tense: false, resetKey });

  if (reached.resetKey !== resetKey) setReached({ tense: false, resetKey });

  useEffect(() => {
    elapsedMs.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const before = elapsedMs.current;
    const sync = () => {
      elapsedMs.current = before + (Date.now() - startedAt);
      return elapsedMs.current;
    };

    const timer = window.setInterval(() => {
      if (sync() >= threshold) {
        setReached((previous) => (previous.tense ? previous : { ...previous, tense: true }));
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
      sync();
    };
  }, [running, threshold, resetKey]);

  // The clock only accrues while the match runs, so ending it releases the cue.
  return running && reached.tense;
}
