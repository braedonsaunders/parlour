'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';

type DealCue = { column: number; landsAt: number };

export interface KlondikeDealPresentation {
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
export function useKlondikeDealPresentation(
  fx: readonly FxEvent[],
  fxKey: string | number,
  reduced: boolean,
): KlondikeDealPresentation {
  const plan = useMemo(() => planDeal(fx), [fx]);
  const isOpening = plan.length === 28;
  const complete = !isOpening || reduced;
  const initial = complete ? fullCounts() : emptyCounts();
  const [progress, setProgress] = useState<{ key: string | number; counts: readonly number[] }>(
    () => ({
      key: fxKey,
      counts: initial,
    }),
  );
  const visibleByColumn = progress.key === fxKey ? progress.counts : initial;

  useEffect(() => {
    if (complete) return;
    const timers = plan.map((cue) =>
      window.setTimeout(() => {
        setProgress((current) => {
          const counts = current.key === fxKey ? current.counts : emptyCounts();
          return {
            key: fxKey,
            counts: counts.map((count, column) => (column === cue.column ? count + 1 : count)),
          };
        });
      }, cue.landsAt),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [complete, fxKey, plan]);

  return {
    sequence: isOpening,
    visibleByColumn,
    dealing: isOpening && visibleByColumn.some((count, column) => count < column + 1),
  };
}

function emptyCounts(): number[] {
  return Array.from({ length: 7 }, () => 0);
}

function fullCounts(): number[] {
  return Array.from({ length: 7 }, (_, column) => column + 1);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
