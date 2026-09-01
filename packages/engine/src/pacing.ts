import { makeRng } from './rng';
import type { SeatId } from './types';

/**
 * A table-wide pacing intent. Rules describe urgency, never milliseconds;
 * every client can therefore render the same game at the same human cadence.
 */
export type TablePacingMode = 'casual' | 'brisk' | 'timed' | 'takeover' | 'automatic' | 'realtime';

export interface TablePacingPolicy {
  /** Readable pause after the current visual burst has finished. */
  postFxMs: number;
  /** Inclusive lower bound for the visible thinking beat. */
  botThinkMinMs: number;
  /** Inclusive upper bound for the visible thinking beat. */
  botThinkMaxMs: number;
}

/**
 * Shared bot cadence for every Parlour client.
 *
 * These are thinking beats, not animation durations. A presentation runtime
 * waits for its current fx to finish, then adds this beat. Casual play follows
 * the 400–900 ms product envelope; urgent and takeover play stays below 150 ms.
 */
export const TABLE_PACING: Readonly<Record<TablePacingMode, TablePacingPolicy>> = {
  casual: { postFxMs: 600, botThinkMinMs: 560, botThinkMaxMs: 840 },
  brisk: { postFxMs: 220, botThinkMinMs: 180, botThinkMaxMs: 280 },
  timed: { postFxMs: 100, botThinkMinMs: 80, botThinkMaxMs: 140 },
  takeover: { postFxMs: 100, botThinkMinMs: 80, botThinkMaxMs: 140 },
  automatic: { postFxMs: 160, botThinkMinMs: 0, botThinkMaxMs: 0 },
  realtime: { postFxMs: 0, botThinkMinMs: 0, botThinkMaxMs: 0 },
};

/**
 * A continuing choice by the same seat stays responsive; passing control to a
 * different person receives the full table cadence.
 */
export function tableTransitionPacing(
  base: TablePacingMode,
  before: readonly SeatId[],
  after: readonly SeatId[],
): TablePacingMode {
  if (base === 'casual' && before.length === 1 && after.length === 1 && before[0] === after[0]) {
    return 'brisk';
  }
  return base;
}

export interface BotThinkTimeInput {
  mode?: TablePacingMode;
  /** Replay seed: keeps the visible beat stable across host handover. */
  seed: number;
  /** Usually the current event-log length. */
  turn: number;
  seat: number;
}

/** A deterministic thinking beat for a seat at one replay position. */
export function botThinkTimeMs({ mode = 'casual', seed, turn, seat }: BotThinkTimeInput): number {
  const policy = TABLE_PACING[mode];
  const width = policy.botThinkMaxMs - policy.botThinkMinMs;
  if (width === 0) return policy.botThinkMinMs;
  const rng = makeRng(seed).fork(`pace:${mode}:${turn}:${seat}`);
  return policy.botThinkMinMs + rng.int(width + 1);
}
