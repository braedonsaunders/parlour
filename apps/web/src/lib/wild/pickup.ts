'use client';

import { useEffect, useState } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';

export type WildPickupReason = 'penalty' | 'caught' | 'challenge';

export interface WildPickup {
  seat: number;
  /** Cards this seat is about to take. */
  amount: number;
  reason: WildPickupReason;
  /** When the first card leaves the stock. */
  startMs: number;
  /** Landing times, ascending — one per card. */
  landings: readonly number[];
}

const REASONS: readonly WildPickupReason[] = ['penalty', 'caught', 'challenge'];

/**
 * Finds the pickup in a burst of engine effects, if there is one. Only pickups
 * a seat did not choose are announced by the engine, so a voluntary draw stays
 * quiet and the counter is reserved for the moments that need explaining.
 */
export function wildPickup(fx: readonly FxEvent[]): WildPickup | null {
  const event = fx.find((candidate) => candidate.kind === 'wildpile.pickup');
  if (!event) return null;
  const seat = numberField(event, 'seat');
  const amount = numberField(event, 'amount');
  const reason = stringField(event, 'reason');
  if (seat === null || amount === null || amount <= 0) return null;

  const startMs = Math.max(0, event.at ?? 0);
  // Land the counter against the real card flights rather than re-deriving the
  // stagger, so the number can never drift out of step with the cards.
  const landings = fx
    .filter(
      (candidate) => candidate.kind === Fx.DrawCard && numberField(candidate, 'seat') === seat,
    )
    .map((candidate) => Math.max(0, candidate.at ?? 0))
    .filter((at) => at >= startMs)
    .sort((a, b) => a - b)
    .slice(0, amount);

  return {
    seat,
    amount,
    reason: REASONS.includes(reason as WildPickupReason) ? (reason as WildPickupReason) : 'penalty',
    startMs,
    landings,
  };
}

/**
 * Counts a pickup out card by card, in step with the flights. Returns null
 * until the first card is in the air and again once the last one has landed, so
 * the caller can simply render whatever it gets.
 */
export function useWildPickupCount(
  pickup: WildPickup | null,
  fxKey: string | number,
): { taken: number; left: number } | null {
  // Progress carries the burst it belongs to, so a new burst reads as "not
  // started yet" during render instead of needing a reset inside the effect.
  const burstKey = pickup ? `${fxKey}:${pickup.seat}:${pickup.amount}:${pickup.startMs}` : null;
  const [progress, setProgress] = useState<{ key: string; taken: number } | null>(null);

  useEffect(() => {
    if (!pickup || !burstKey) return;
    const timers = [
      window.setTimeout(() => setProgress({ key: burstKey, taken: 0 }), pickup.startMs),
      ...pickup.landings.map((at, index) =>
        // The card is counted when it arrives, not when it launches.
        window.setTimeout(
          () => setProgress({ key: burstKey, taken: index + 1 }),
          at + PICKUP_LANDING_MS,
        ),
      ),
      window.setTimeout(
        () => setProgress(null),
        (pickup.landings.at(-1) ?? pickup.startMs) + PICKUP_LANDING_MS + PICKUP_HOLD_MS,
      ),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [burstKey, pickup]);

  if (!pickup || progress?.key !== burstKey) return null;
  return { taken: progress.taken, left: Math.max(0, pickup.amount - progress.taken) };
}

/** Matches FX_TIMING.drawFlightMs — how long a card is in the air. */
const PICKUP_LANDING_MS = 200;

/** Beat the finished count is held on screen before it clears. */
const PICKUP_HOLD_MS = 700;

function numberField(event: FxEvent, field: string): number | null {
  const payload = objectPayload(event);
  const value = payload?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringField(event: FxEvent, field: string): string | null {
  const payload = objectPayload(event);
  const value = payload?.[field];
  return typeof value === 'string' ? value : null;
}

function objectPayload(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}
