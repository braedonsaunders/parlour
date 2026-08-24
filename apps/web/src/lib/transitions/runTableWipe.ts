'use client';

import { getAudioManager } from '@/lib/audio/AudioManager';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { useWipeStore } from '@/stores/wipe';
import { prefersReducedMotion, WIPE_TIMINGS } from './tableWipe';

let active = false;

/**
 * Covers the screen, swaps routes underneath at full opacity, then reveals.
 *
 * `nav` is invoked while the wipe is opaque, so the outgoing page never shows
 * the incoming one mid-load and the incoming one never flashes uncovered.
 * Same-route pushes (play again) resolve through the safety window because
 * the pathname never changes; the overlay's arrival effect marks those
 * immediately, keeping play-again snappy.
 */
export function runTableWipe(nav: () => void, target: string, origin: string): void {
  if (active || prefersReducedMotion()) {
    nav();
    return;
  }
  active = true;
  void sequence(nav, target, origin).finally(() => {
    active = false;
  });
}

async function sequence(nav: () => void, target: string, origin: string): Promise<void> {
  const journeyId = useWipeStore.getState().begin(target, origin);
  chime(PARLOUR_SFX.stockShuffle);

  await delay(WIPE_TIMINGS.coverMs);
  if (stale(journeyId)) return;
  useWipeStore.getState().markCovered();

  nav();
  await delay(WIPE_TIMINGS.holdMs);
  if (stale(journeyId)) return;

  const deadline = Date.now() + WIPE_TIMINGS.arrivalSafetyMs;
  while (!useWipeStore.getState().arrived && Date.now() < deadline) {
    await delay(40);
    if (stale(journeyId)) return;
  }
  if (stale(journeyId)) return;

  useWipeStore.getState().beginReveal();
  chime(PARLOUR_SFX.dealCard);
  await delay(WIPE_TIMINGS.revealMs);
  if (stale(journeyId)) return;
  useWipeStore.getState().clear();
}

function stale(journeyId: number): boolean {
  const state = useWipeStore.getState();
  return state.journeyId !== journeyId || state.status === 'idle';
}

/** Audio is best-effort: an locked or muted manager simply plays nothing. */
function chime(id: string): void {
  try {
    getAudioManager().play(id);
  } catch {
    /* audio unavailable */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
