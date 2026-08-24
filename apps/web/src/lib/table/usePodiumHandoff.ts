'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * The delayed hand-off from a finished table to the podium.
 *
 * Every table reports its result from an effect that depends on the whole
 * snapshot, guarded by a one-shot ref. Arming the navigation timer inside that
 * effect and clearing it from the effect's cleanup looked symmetrical, but the
 * two guards fight each other: any render between the win and the hand-off
 * re-runs the effect, the cleanup cancels the pending navigation, and the
 * one-shot guard then returns early without re-arming. The result is a player
 * left sitting on a finished table with no way forward.
 *
 * The timer belongs to the component, not to a single run of the effect, so it
 * lives here and is cleared only when the table actually unmounts.
 */
export function usePodiumHandoff(): (delayMs: number, go: () => void) => void {
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useCallback((delayMs: number, go: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(go, delayMs);
  }, []);
}
