import type { FxEvent } from '@parlour/engine';
import { prefersCalmMotion } from './calm-motion';
import { useProfileStore } from '@/stores/profile';

/**
 * The shared 3·2·1 that opens every table (TableCountdown) needs the deal to
 * wait for it. Every presentation system — card flights, deal admissions,
 * sound cues, even the bot pacing that waits for fx to settle — keys off each
 * fx event's relative `at`, so holding the opening burst is one map: push
 * every event out by the countdown's three beats and the whole choreography
 * starts exactly as "Deal!" lands.
 */
export const OPENING_COUNTDOWN_LEAD_MS = 2_400;

/** Zero for calm-motion players, who skip the countdown entirely. */
export function openingCountdownLeadMs(): number {
  const reduced = prefersCalmMotion() || useProfileStore.getState().settings.reducedMotion;
  return reduced ? 0 : OPENING_COUNTDOWN_LEAD_MS;
}

export function holdFxForCountdown(
  events: readonly FxEvent[],
  leadMs: number = openingCountdownLeadMs(),
): readonly FxEvent[] {
  if (leadMs <= 0 || events.length === 0) return events;
  return events.map((event) => ({ ...event, at: (event.at ?? 0) + leadMs }));
}
