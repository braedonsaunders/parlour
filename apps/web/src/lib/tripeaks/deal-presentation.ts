'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { TABLEAU_SIZE } from '@parlour/game-tripeaks';

type DealCue = { index: number | 'hole'; landsAt: number };

export interface TripeaksDealPresentation {
  sequence: boolean;
  dealing: boolean;
  visibleTableau: readonly boolean[];
  holeVisible: boolean;
}

function planDeal(fx: readonly FxEvent[]): DealCue[] {
  return fx.flatMap((event): DealCue[] => {
    if (event.kind !== 'card.fly') return [];
    const payload = record(event.payload);
    const to = payload?.to;
    if (typeof to !== 'string') return [];
    const duration = typeof payload?.dur === 'number' ? payload.dur : 200;
    const landsAt = Math.max(0, event.at ?? 0) + duration;
    if (to === 'hole') return [{ index: 'hole', landsAt }];
    const match = /^tableau:(\d+)$/.exec(to);
    return match ? [{ index: Number(match[1]), landsAt }] : [];
  });
}

type Progress = {
  key: string | number;
  tableau: readonly boolean[];
  hole: boolean;
  settled: boolean;
};

/** Gates the final board by opaque cue count, never by hidden card identity. */
export function useTripeaksDealPresentation(
  fx: readonly FxEvent[],
  fxKey: string | number,
  reduced: boolean,
): TripeaksDealPresentation {
  const plan = useMemo(() => planDeal(fx), [fx]);
  const isOpening = plan.length === TABLEAU_SIZE + 1;
  const complete = !isOpening || reduced;
  const initial = complete ? fullState() : emptyState();
  const [progress, setProgress] = useState<Progress>(() => ({
    key: fxKey,
    ...initial,
    settled: complete,
  }));
  const currentProgress =
    progress.key === fxKey ? progress : { key: fxKey, ...initial, settled: complete };
  const settledProgress =
    complete && !currentProgress.settled
      ? { key: fxKey, ...fullState(), settled: true }
      : currentProgress;
  if (settledProgress !== progress) setProgress(settledProgress);

  const progressSettled = settledProgress.settled;
  const resolved = complete || progressSettled ? fullState() : settledProgress;

  useEffect(() => {
    if (complete || progressSettled) return;
    const timers = plan.map((cue) =>
      window.setTimeout(() => {
        setProgress((current) => {
          const base = current.key === fxKey ? current : { ...emptyState(), key: fxKey };
          const tableau =
            cue.index === 'hole'
              ? base.tableau
              : base.tableau.map((visible, index) => (index === cue.index ? true : visible));
          const hole = cue.index === 'hole' ? true : base.hole;
          return {
            key: fxKey,
            tableau,
            hole,
            settled: hole && tableau.every(Boolean),
          };
        });
      }, cue.landsAt),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [complete, fxKey, plan, progressSettled]);

  return {
    sequence: isOpening,
    visibleTableau: resolved.tableau,
    holeVisible: resolved.hole,
    dealing: isOpening && (!resolved.hole || resolved.tableau.some((visible) => !visible)),
  };
}

function emptyState(): { tableau: boolean[]; hole: boolean } {
  return { tableau: Array.from({ length: TABLEAU_SIZE }, () => false), hole: false };
}

function fullState(): { tableau: boolean[]; hole: boolean } {
  return { tableau: Array.from({ length: TABLEAU_SIZE }, () => true), hole: true };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
