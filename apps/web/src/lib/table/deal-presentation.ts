'use client';

import { useLayoutEffect, useMemo, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { prefersCalmMotion } from './calm-motion';
import { buildFxTimeline, type FxCue } from './fx-motion';

type SetupCue = Extract<FxCue, { type: 'deal' | 'flip' }>;

/**
 * What one seat was dealt, as cues rather than identities.
 *
 * Counting distinct card ids was only ever right by accident: it happens to
 * equal the cue count when a game deals face-up, distinct cards. Spades deals
 * every card as `??` — even to you — so a Set collapsed thirteen cues into one
 * and the whole hand appeared before a single card had landed. Cue count is
 * the honest measure; identity is a bonus some games happen to provide.
 */
type SeatDealPlan = {
  /** Deal cue ids for this seat, in deal order. */
  cueIds: readonly string[];
  /** Distinct planned identities, empty-ish when the deal is opaque. */
  cards: ReadonlySet<string>;
  cueIdByCard: ReadonlyMap<string, string>;
  /** True when identities cannot address individual cues (duplicates/`??`). */
  opaque: boolean;
};

type DealPlan = {
  cues: readonly SetupCue[];
  seats: ReadonlyMap<number, SeatDealPlan>;
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

  type Building = { cueIds: string[]; cards: Set<string>; byCard: Map<string, string> };
  const building = new Map<number, Building>();
  let flipCueId: string | null = null;

  for (const cue of setupCues) {
    if (cue.type === 'flip') {
      flipCueId = cue.id;
      continue;
    }
    const seat = seatFromHandZone(cue.to);
    if (seat === null) continue;
    const entry: Building = building.get(seat) ?? {
      cueIds: [],
      cards: new Set<string>(),
      byCard: new Map<string, string>(),
    };
    entry.cueIds.push(cue.id);
    entry.cards.add(cue.card);
    entry.byCard.set(cue.card, cue.id);
    building.set(seat, entry);
  }

  const seats = new Map<number, SeatDealPlan>();
  for (const [seat, entry] of building) {
    seats.set(seat, {
      cueIds: entry.cueIds,
      cards: entry.cards,
      cueIdByCard: entry.byCard,
      // Fewer distinct identities than cues means at least one id was reused,
      // so no id can name a single cue.
      opaque: entry.cards.size !== entry.cueIds.length,
    });
  }

  return { cues: setupCues, seats, flipCueId };
}

export type DealPresentationOptions = {
  /**
   * Collapse the deal immediately regardless of the OS media query. The
   * profile's own "reduced motion" switch only sets a CSS class, so without
   * this the JS-timed choreography kept running for someone who explicitly
   * asked it to stop.
   */
  reduced?: boolean;
};

export function useDealPresentation(
  events: readonly FxEvent[],
  fxKey: string | number,
  options: DealPresentationOptions = {},
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

  const forceReduced = options.reduced ?? false;

  useLayoutEffect(() => {
    if (!plan) return;
    const reduced =
      forceReduced || prefersCalmMotion();
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
  }, [fxKey, plan, forceReduced]);

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
      const seatPlan = plan.seats.get(seat);
      if (!seatPlan) return cards;
      const landedCount = landedBySeat.get(seat) ?? 0;
      // Opaque deals, and deals whose planned ids simply are not these cards
      // (a veiled hand opening into real ones), can only be revealed by count.
      // The hand is already in presentation order, so the prefix is correct.
      if (seatPlan.opaque || !cards.some((card) => seatPlan.cards.has(card))) {
        const alreadyHeld = Math.max(0, cards.length - seatPlan.cueIds.length);
        return cards.slice(0, alreadyHeld + landedCount);
      }
      return cards.filter((card) => {
        if (!seatPlan.cards.has(card)) return true;
        const cueId = seatPlan.cueIdByCard.get(card);
        return cueId !== undefined && landedCueIds.has(cueId);
      });
    },
    visibleCount(seat, finalCount) {
      const plannedCount = plan.seats.get(seat)?.cueIds.length ?? 0;
      return Math.max(0, finalCount - plannedCount) + (landedBySeat.get(seat) ?? 0);
    },
  };
}
