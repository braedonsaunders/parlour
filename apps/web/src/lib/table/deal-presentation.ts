'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { buildFxTimeline, type FxCue } from './fx-motion';

type SetupCue = Extract<FxCue, { type: 'deal' | 'flip' }>;

type DealPlan = {
  cues: readonly SetupCue[];
  cardsBySeat: ReadonlyMap<number, ReadonlySet<string>>;
  cueIdByCard: ReadonlyMap<string, string>;
  flipCueId: string | null;
};

export type DealPresentation = {
  sequence: boolean;
  dealing: boolean;
  complete: boolean;
  pendingStockCards: number;
  discardReady: boolean;
  visibleCards(cards: readonly string[], seat: number): readonly string[];
  visibleCount(seat: number, finalCount: number): number;
};

const LIVE_PRESENTATION: DealPresentation = {
  sequence: false,
  dealing: false,
  complete: false,
  pendingStockCards: 0,
  discardReady: true,
  visibleCards: (cards) => cards,
  visibleCount: (_seat, finalCount) => finalCount,
};

const NO_LANDED_CUES: ReadonlySet<string> = new Set();

function seatFromHandZone(zone: string): number | null {
  const match = /^hand:(\d+)$/.exec(zone);
  return match ? Number(match[1]) : null;
}

export function buildDealPlan(events: readonly FxEvent[]): DealPlan | null {
  const setupCues = buildFxTimeline(events).filter(
    (cue): cue is SetupCue => cue.type === 'deal' || cue.type === 'flip',
  );
  if (!setupCues.some((cue) => cue.type === 'deal')) return null;

  const mutableCardsBySeat = new Map<number, Set<string>>();
  const cueIdByCard = new Map<string, string>();
  let flipCueId: string | null = null;

  for (const cue of setupCues) {
    if (cue.type === 'flip') {
      flipCueId = cue.id;
      continue;
    }
    const seat = seatFromHandZone(cue.to);
    if (seat === null) continue;
    const cards = mutableCardsBySeat.get(seat) ?? new Set<string>();
    cards.add(cue.card);
    mutableCardsBySeat.set(seat, cards);
    cueIdByCard.set(cue.card, cue.id);
  }

  return {
    cues: setupCues,
    cardsBySeat: mutableCardsBySeat,
    cueIdByCard,
    flipCueId,
  };
}

export function useDealPresentation(
  events: readonly FxEvent[],
  fxKey: string | number,
): DealPresentation {
  const plan = useMemo(() => {
    try {
      return buildDealPlan(events);
    } catch {
      return null;
    }
  }, [events]);
  const [landed, setLanded] = useState<{
    fxKey: string | number | null;
    cueIds: ReadonlySet<string>;
  }>(() => ({ fxKey: null, cueIds: NO_LANDED_CUES }));
  const landedCueIds = landed.fxKey === fxKey ? landed.cueIds : NO_LANDED_CUES;

  useLayoutEffect(() => {
    if (!plan) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      const timer = window.setTimeout(
        () => setLanded({ fxKey, cueIds: new Set(plan.cues.map(({ id }) => id)) }),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    const timers = plan.cues.map((cue) =>
      window.setTimeout(() => {
        setLanded((current) => {
          const next = new Set(current.fxKey === fxKey ? current.cueIds : NO_LANDED_CUES);
          next.add(cue.id);
          return { fxKey, cueIds: next };
        });
      }, cue.startMs + cue.durationMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fxKey, plan]);

  if (!plan) return LIVE_PRESENTATION;

  const landedBySeat = new Map<number, number>();
  for (const cue of plan.cues) {
    if (cue.type !== 'deal' || !landedCueIds.has(cue.id)) continue;
    const seat = seatFromHandZone(cue.to);
    if (seat !== null) landedBySeat.set(seat, (landedBySeat.get(seat) ?? 0) + 1);
  }
  const complete = plan.cues.every(({ id }) => landedCueIds.has(id));

  return {
    sequence: true,
    dealing: !complete,
    complete,
    pendingStockCards: plan.cues.filter(({ id }) => !landedCueIds.has(id)).length,
    discardReady: plan.flipCueId === null || landedCueIds.has(plan.flipCueId),
    visibleCards(cards, seat) {
      const plannedCards = plan.cardsBySeat.get(seat);
      if (!plannedCards) return cards;
      return cards.filter((card) => {
        if (!plannedCards.has(card)) return true;
        const cueId = plan.cueIdByCard.get(card);
        return cueId !== undefined && landedCueIds.has(cueId);
      });
    },
    visibleCount(seat, finalCount) {
      const plannedCount = plan.cardsBySeat.get(seat)?.size ?? 0;
      return Math.max(0, finalCount - plannedCount) + (landedBySeat.get(seat) ?? 0);
    },
  };
}
