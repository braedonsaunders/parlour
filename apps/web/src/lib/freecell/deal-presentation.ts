'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { COLUMN_LENGTHS, TABLEAU_COLUMNS } from '@parlour/game-freecell';

type DealCue = { column: number; landsAt: number };

export interface FreecellDealPresentation {
  sequence: boolean;
  dealing: boolean;
  visibleByColumn: readonly number[];
}

function planDeal(fx: readonly FxEvent[]): DealCue[] {
  return fx.flatMap((event) => {
    if (event.kind !== 'card.fly') return [];
    const payload = record(event.payload);
    const to = payload?.to;
    const match = typeof to === 'string' ? /^tableau:(\d)$/.exec(to) : null;
    if (!match) return [];
    const column = Number(match[1]);
    const duration = typeof payload?.dur === 'number' ? payload.dur : 220;
    return [{ column, landsAt: Math.max(0, event.at ?? 0) + duration }];
  });
}

/** Gates the final board by opaque cue count, never by hidden card identity. */
export function useFreecellDealPresentation(
  fx: readonly FxEvent[],
  fxKey: string | number,
  reduced: boolean,
): FreecellDealPresentation {
  const plan = useMemo(() => planDeal(fx), [fx]);
  const isOpening = plan.length === 52;
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
  const visibleByColumn = complete || progressSettled ? fullCounts() : settledProgress.counts;

  useEffect(() => {
    if (complete || progressSettled) return;
    const timers = plan.map((cue) =>
      window.setTimeout(() => {
        setProgress((current) => {
          const counts = current.key === fxKey ? current.counts : emptyCounts();
          const next = counts.map((count, column) =>
            column === cue.column
              ? Math.min(COLUMN_LENGTHS[column] ?? count + 1, count + 1)
              : count,
          );
          return {
            key: fxKey,
            counts: next,
            settled: next.every((count, column) => count >= (COLUMN_LENGTHS[column] ?? 0)),
          };
        });
      }, cue.landsAt),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [complete, fxKey, plan, progressSettled]);

  return {
    sequence: isOpening,
    visibleByColumn,
    dealing:
      isOpening && visibleByColumn.some((count, column) => count < (COLUMN_LENGTHS[column] ?? 0)),
  };
}

function emptyCounts(): number[] {
  return Array.from({ length: TABLEAU_COLUMNS }, () => 0);
}

function fullCounts(): number[] {
  return [...COLUMN_LENGTHS];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
