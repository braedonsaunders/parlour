'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { TABLEAU_COLUMNS, TABLEAU_ROWS } from '@parlour/game-golf';

type DealCue = { column: number; landsAt: number };

export interface GolfDealPresentation {
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
    const duration = typeof payload?.dur === 'number' ? payload.dur : 200;
    return [{ column, landsAt: Math.max(0, event.at ?? 0) + duration }];
  });
}

/** Gates the final board by opaque cue count, never by hidden card identity. */
export function useGolfDealPresentation(
  fx: readonly FxEvent[],
  fxKey: string | number,
  reduced: boolean,
): GolfDealPresentation {
  const plan = useMemo(() => planDeal(fx), [fx]);
  const isOpening = plan.length === TABLEAU_COLUMNS * TABLEAU_ROWS;
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
            column === cue.column ? Math.min(TABLEAU_ROWS, count + 1) : count,
          );
          return {
            key: fxKey,
            counts: next,
            settled: next.every((count) => count >= TABLEAU_ROWS),
          };
        });
      }, cue.landsAt),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [complete, fxKey, plan, progressSettled]);

  return {
    sequence: isOpening,
    visibleByColumn,
    dealing: isOpening && visibleByColumn.some((count) => count < TABLEAU_ROWS),
  };
}

function emptyCounts(): number[] {
  return Array.from({ length: TABLEAU_COLUMNS }, () => 0);
}

function fullCounts(): number[] {
  return Array.from({ length: TABLEAU_COLUMNS }, () => TABLEAU_ROWS);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
