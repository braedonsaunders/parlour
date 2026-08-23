import type { FxEvent } from '@parlour/engine';

/**
 * Round-end choreography planner (spec §6.5, §7).
 *
 * The UI animates ONLY from engine fx events — this turns the pinned fx tail
 * of a round (burst.knock | burst.blitz, showdown.reveal×N, chip.loss×M,
 * round.end) into a timed plan. Pure: fully unit-tested, no React.
 */

export type RoundEndKind = 'knock' | 'blitz' | 'showdown';

export interface RevealStep {
  seat: number;
  handValue: number;
  atMs: number;
}

export interface ChipLossStep {
  seat: number;
  livesLeft: number;
  atMs: number;
}

export interface RoundEndPlan {
  kind: RoundEndKind;
  /** Knocker or blitzing seat; null for a bare-showdown reason. */
  actorSeat: number | null;
  actorHandValue: number | null;
  reveals: readonly RevealStep[];
  chipLosses: readonly ChipLossStep[];
  /** When the result banner (KNOCKED! / BLITZ! / SHOWDOWN) slams down. */
  bannerAtMs: number;
  endReason: string;
  /** When the last choreographed beat lands. */
  totalMs: number;
  /** Auto-deal countdown target from overlay start — spec caps this at 4 s. */
  nextReadyAtMs: number;
}

export const MAX_AUTO_NEXT_MS = 4000;
const REVEAL_GAP_MS = 320;
const CHIP_GAP_MS = 140;
/** Fallback spacing when fx carry no `at` offset. */
const DEFAULT_GAP_MS = 300;

interface Cursor {
  t: number;
}

function effectiveAt(event: FxEvent, cursor: Cursor, gapMs: number): number {
  if (typeof event.at === 'number' && event.at >= cursor.t) {
    cursor.t = event.at;
    return event.at;
  }
  cursor.t += gapMs;
  return cursor.t;
}

function findPayload<T>(events: readonly FxEvent[], kind: string): T | null {
  const found = events.find((e) => e.kind === kind);
  return found ? (found.payload as T) : null;
}

export interface BuildRoundEndOptions {
  autoNextDelayMs?: number;
}

export function buildRoundEndPlan(
  fx: readonly FxEvent[],
  options: BuildRoundEndOptions = {},
): RoundEndPlan | null {
  const end = findPayload<{ reason?: string }>(fx, 'round.end');
  if (!end) return null;

  const blitz = findPayload<{ seat?: number; handValue?: number }>(fx, 'burst.blitz');
  const knock = findPayload<{ seat?: number }>(fx, 'burst.knock');

  let kind: RoundEndKind = 'showdown';
  let actorSeat: number | null = null;
  let actorHandValue: number | null = null;
  if (blitz && typeof blitz.seat === 'number') {
    kind = 'blitz';
    actorSeat = blitz.seat;
    actorHandValue = typeof blitz.handValue === 'number' ? blitz.handValue : 31;
  } else if (knock && typeof knock.seat === 'number') {
    kind = 'knock';
    actorSeat = knock.seat;
  }

  // Reveals keep their authored order (around-the-table); `at` offsets win when present.
  const revealCursor: Cursor = { t: 0 };
  const reveals: RevealStep[] = [];
  for (const event of fx) {
    if (event.kind !== 'showdown.reveal') continue;
    const payload = event.payload as { seat?: unknown; handValue?: unknown };
    if (typeof payload?.seat !== 'number' || typeof payload?.handValue !== 'number') continue;
    reveals.push({
      seat: payload.seat,
      handValue: payload.handValue,
      atMs: effectiveAt(event, revealCursor, REVEAL_GAP_MS),
    });
  }

  const chipCursor: Cursor = { t: reveals.length > 0 ? reveals[reveals.length - 1]!.atMs : 0 };
  const chipLosses: ChipLossStep[] = [];
  for (const event of fx) {
    if (event.kind !== 'chip.loss') continue;
    const payload = event.payload as { seat?: unknown; livesLeft?: unknown };
    if (typeof payload?.seat !== 'number') continue;
    const livesLeft = typeof payload.livesLeft === 'number' ? Math.max(0, payload.livesLeft) : 0;
    const atMs = effectiveAt(event, chipCursor, CHIP_GAP_MS);
    chipLosses.push({ seat: payload.seat, livesLeft, atMs });
  }

  const beats = [...reveals.map((r) => r.atMs), ...chipLosses.map((c) => c.atMs + 400)];
  const totalMs = beats.length > 0 ? Math.max(...beats) : DEFAULT_GAP_MS * 2;

  const requested = options.autoNextDelayMs ?? MAX_AUTO_NEXT_MS - 200;
  // Spec §7.4: the next round NEVER waits for a cosmetic tail — the countdown
  // stays under the 4 s cap even if a long reveal cascade is still settling.
  const nextReadyAtMs = Math.max(0, Math.min(requested, MAX_AUTO_NEXT_MS));

  // Blitz slams instantly; knock/showdown banners land after the reveal cascade.
  let bannerAtMs: number;
  if (kind === 'blitz') {
    bannerAtMs = Math.min(200, totalMs);
  } else if (reveals.length > 0) {
    bannerAtMs = reveals[reveals.length - 1]!.atMs + 350;
  } else {
    bannerAtMs = Math.min(400, totalMs);
  }

  return {
    kind,
    actorSeat,
    actorHandValue,
    reveals,
    chipLosses,
    bannerAtMs,
    endReason: end.reason ?? kind,
    totalMs,
    nextReadyAtMs,
  };
}
