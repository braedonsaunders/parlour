'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { PYRAMID_ROWS, PYRAMID_SIZE } from '@parlour/game-pyramid';

type DealCue = { row: number; col: number; landsAt: number };

export interface PyramidDealPresentation {
  sequence: boolean;
  dealing: boolean;
  visibleByRow: readonly number[];
}

function planDeal(fx: readonly FxEvent[]): DealCue[] {
  return fx.flatMap((event) => {
    if (event.kind !== 'card.fly') return [];
    const payload = record(event.payload);
    const to = payload?.to;
    const match = typeof to === 'string' ? /^pyramid:(\d+):(\d+)$/.exec(to) : null;
    if (!match) return [];
    const row = Number(match[1]);
    const duration = typeof payload?.dur === 'number' ? payload.dur : 200;
    return [{ row, col: Number(match[2]), landsAt: Math.max(0, event.at ?? 0) + duration }];
  });
}

/** Gates the final board by opaque cue count, never by hidden card identity. */
export function usePyramidDealPresentation(
  fx: readonly FxEvent[],
  fxKey: string | number,
  reduced: boolean,
): PyramidDealPresentation {
  const plan = useMemo(() => planDeal(fx), [fx]);
  const isOpening = plan.length === PYRAMID_SIZE;
  const complete = !isOpening || reduced;
  const initial = complete ? fullCounts() : emptyCounts();
  const [progress, setProgress] = useState<{
    key: string | number;
    counts: readonly number[];
    settled: boolean;
  }>(() => ({
    key: fxKey,
    counts: initial,
    settled: complete,
  }));
  const currentProgress =
    progress.key === fxKey ? progress : { key: fxKey, counts: initial, settled: complete };
  const settledProgress =
    complete && !currentProgress.settled
      ? { key: fxKey, counts: fullCounts(), settled: true }
      : currentProgress;
  if (settledProgress !== progress) setProgress(settledProgress);

  const progressSettled = settledProgress.settled;
  const visibleByRow = complete || progressSettled ? fullCounts() : settledProgress.counts;

  useEffect(() => {
    if (complete || progressSettled) return;
    const timers = plan.map((cue) =>
      window.setTimeout(() => {
        setProgress((current) => {
          const counts = current.key === fxKey ? current.counts : emptyCounts();
          const next = counts.map((count, row) =>
            row === cue.row ? Math.min(row + 1, count + 1) : count,
          );
          return {
            key: fxKey,
            counts: next,
            settled: next.every((count, row) => count >= row + 1),
          };
        });
      }, cue.landsAt),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [complete, fxKey, plan, progressSettled]);

  return {
    sequence: isOpening,
    visibleByRow,
    dealing: isOpening && visibleByRow.some((count, row) => count < row + 1),
  };
}

function emptyCounts(): number[] {
  return Array.from({ length: PYRAMID_ROWS }, () => 0);
}

function fullCounts(): number[] {
  return Array.from({ length: PYRAMID_ROWS }, (_, row) => row + 1);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
