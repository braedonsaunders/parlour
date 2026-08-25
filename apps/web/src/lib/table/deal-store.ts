import type { FxEvent } from '@parlour/engine';
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

export type DealPhase = Pick<DealPresentation, 'sequence' | 'dealing' | 'complete'>;
export type DealPiles = Pick<DealPresentation, 'pendingStockCards' | 'discardReady'>;

export const LIVE_PRESENTATION: DealPresentation = {
  sequence: false,
  dealing: false,
  complete: false,
  pendingStockCards: 0,
  discardReady: true,
  visibleCards: (cards) => cards,
  visibleCount: (_seat, finalCount) => finalCount,
};

export const LIVE_PHASE: DealPhase = { sequence: false, dealing: false, complete: false };
export const LIVE_PILES: DealPiles = { pendingStockCards: 0, discardReady: true };

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

export type DealStore = {
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  getPhase: () => DealPhase;
  getPiles: () => DealPiles;
  getPresentation: () => DealPresentation;
  visibleCards: (cards: readonly string[], seat: number) => readonly string[];
  visibleCount: (seat: number, finalCount: number) => number;
  prepare: (fxKey: string | number, plan: DealPlan | null) => void;
  flushPrepare: () => void;
  land: (cueId: string) => void;
  settleAll: (cueIds: readonly string[]) => void;
};

export function createDealStore(): DealStore {
  let fxKey: string | number | null = null;
  let plan: DealPlan | null = null;
  let landedCueIds: ReadonlySet<string> = NO_LANDED_CUES;
  let version = 0;
  let publishedVersion = 0;
  let phase: DealPhase = LIVE_PHASE;
  let piles: DealPiles = LIVE_PILES;
  const visibleCardCache = new Map<
    number,
    { cards: readonly string[]; visible: readonly string[] }
  >();
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function emit(): void {
    publishedVersion = version;
    for (const listener of listeners) listener();
  }

  function landedBySeat(): Map<number, number> {
    const counts = new Map<number, number>();
    if (!plan) return counts;
    for (const cue of plan.cues) {
      if (cue.type !== 'deal' || !landedCueIds.has(cue.id)) continue;
      const seat = seatFromHandZone(cue.to);
      if (seat !== null) counts.set(seat, (counts.get(seat) ?? 0) + 1);
    }
    return counts;
  }

  function visibleCount(seat: number, finalCount: number): number {
    if (!plan) return finalCount;
    const plannedCount = plan.seats.get(seat)?.cueIds.length ?? 0;
    return Math.max(0, finalCount - plannedCount) + (landedBySeat().get(seat) ?? 0);
  }

  function computeVisibleCards(cards: readonly string[], seat: number): readonly string[] {
    if (!plan) return cards;
    const seatPlan = plan.seats.get(seat);
    if (!seatPlan) return cards;
    const landedCount = landedBySeat().get(seat) ?? 0;
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
  }

  function visibleCards(cards: readonly string[], seat: number): readonly string[] {
    const computed = computeVisibleCards(cards, seat);
    const cached = visibleCardCache.get(seat);
    if (cached && cached.cards === cards && sameOrder(cached.visible, computed)) {
      return cached.visible;
    }
    visibleCardCache.set(seat, { cards, visible: computed });
    return computed;
  }

  function refreshDerived(): void {
    if (!plan) {
      phase = LIVE_PHASE;
      piles = LIVE_PILES;
      return;
    }
    const complete = plan.cues.every(({ id }) => landedCueIds.has(id));
    const nextPhase: DealPhase = { sequence: true, dealing: !complete, complete };
    if (
      phase.sequence !== nextPhase.sequence ||
      phase.dealing !== nextPhase.dealing ||
      phase.complete !== nextPhase.complete
    ) {
      phase = nextPhase;
    }
    const pendingStockCards = plan.cues.filter(({ id }) => !landedCueIds.has(id)).length;
    const discardReady = plan.flipCueId === null || landedCueIds.has(plan.flipCueId);
    if (piles.pendingStockCards !== pendingStockCards || piles.discardReady !== discardReady) {
      piles = { pendingStockCards, discardReady };
    }
  }

  function getPresentation(): DealPresentation {
    if (!plan) return LIVE_PRESENTATION;
    return {
      sequence: true,
      dealing: phase.dealing,
      complete: phase.complete,
      pendingStockCards: piles.pendingStockCards,
      discardReady: piles.discardReady,
      visibleCards,
      visibleCount,
    };
  }

  function prepare(nextKey: string | number, nextPlan: DealPlan | null): void {
    if (fxKey === nextKey && plan === nextPlan) return;
    if (fxKey !== nextKey) {
      fxKey = nextKey;
      landedCueIds = NO_LANDED_CUES;
    }
    plan = nextPlan;
    refreshDerived();
    version += 1;
  }

  function flushPrepare(): void {
    if (publishedVersion === version) return;
    emit();
  }

  function land(cueId: string): void {
    const next = new Set(landedCueIds);
    next.add(cueId);
    landedCueIds = next;
    refreshDerived();
    version += 1;
    emit();
  }

  function settleAll(cueIds: readonly string[]): void {
    landedCueIds = new Set(cueIds);
    refreshDerived();
    version += 1;
    emit();
  }

  return {
    subscribe,
    getVersion: () => version,
    getPhase: () => phase,
    getPiles: () => piles,
    getPresentation,
    visibleCards,
    visibleCount,
    prepare,
    flushPrepare,
    land,
    settleAll,
  };
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((card, index) => card === right[index]);
}
