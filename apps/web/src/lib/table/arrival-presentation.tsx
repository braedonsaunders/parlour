'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { FxEvent } from '@parlour/engine';
import { prefersCalmMotion } from './calm-motion';
import { buildFxTimeline, type FxCue } from './fx-motion';
import {
  createArrivalStore,
  DEFAULT_ARRIVAL,
  type ArrivalState,
  type ArrivalStore,
} from './arrival-store';

type InboundCue = Extract<FxCue, { type: 'draw' | 'transfer' }>;
type OutboundCue = Extract<FxCue, { type: 'discard' | 'trick-play' | 'layoff' | 'transfer' }>;

export type { ArrivalState };

const IDLE_STORE = createArrivalStore();
const ArrivalStoreContext = createContext<ArrivalStore>(IDLE_STORE);

/** Fan opens this far into each inbound flight — late enough to feel invited. */
export const FAN_OPEN_RATIO = 0.4;

function isInbound(cue: FxCue): cue is InboundCue {
  if (cue.type !== 'draw' && cue.type !== 'transfer') return false;
  return cue.to.startsWith('hand:');
}

function isOutbound(cue: FxCue): cue is OutboundCue {
  if (
    cue.type !== 'discard' &&
    cue.type !== 'trick-play' &&
    cue.type !== 'layoff' &&
    cue.type !== 'transfer'
  ) {
    return false;
  }
  return cue.from.startsWith('hand:');
}

function forLocalHand(zone: string, localSeat?: number): boolean {
  return localSeat === undefined || zone === `hand:${localSeat}`;
}

/** Draw and hand-to-hand flights that still need a slot in the destination fan. */
export function inboundArrivalCues(
  events: readonly FxEvent[],
  localSeat?: number,
): readonly InboundCue[] {
  try {
    return buildFxTimeline(events)
      .filter(isInbound)
      .filter((cue) => forLocalHand(cue.to, localSeat));
  } catch {
    return [];
  }
}

export function fanOpenAtMs(cue: { startMs: number; durationMs: number }): number {
  return cue.startMs + cue.durationMs * FAN_OPEN_RATIO;
}

export function outboundDepartureCues(
  events: readonly FxEvent[],
  localSeat?: number,
): readonly OutboundCue[] {
  try {
    return buildFxTimeline(events)
      .filter(isOutbound)
      .filter((cue) => forLocalHand(cue.from, localSeat));
  } catch {
    return [];
  }
}

/**
 * One store per provider, built on first render and never rebuilt.
 *
 * A lazily-filled ref is the obvious way to write this and the wrong one: the
 * React Compiler's lint forbids touching a ref during render, because a render
 * React throws away would still have mutated it. `useState`'s initialiser is
 * the sanctioned form of "compute this exactly once" and is identical in
 * effect — the factory runs on the first render and never again.
 */
function useArrivalStoreInstance(): ArrivalStore {
  const [store] = useState(createArrivalStore);
  return store;
}

function useArrivalClock(
  events: readonly FxEvent[],
  fxKey: string | number,
  localSeat?: number,
): ArrivalStore {
  const store = useArrivalStoreInstance();
  const inbound = useMemo(() => inboundArrivalCues(events, localSeat), [events, localSeat]);
  const outbound = useMemo(() => outboundDepartureCues(events, localSeat), [events, localSeat]);
  store.prepare(fxKey, inbound, outbound);

  useLayoutEffect(() => {
    store.flushPrepare();
    if (inbound.length === 0 && outbound.length === 0) return;
    const reduced = prefersCalmMotion();
    if (reduced) {
      const allIn = inbound.map((cue) => cue.card);
      const allOut = outbound.map((cue) => cue.card);
      const timer = window.setTimeout(() => store.settleAll(allIn, allOut), 0);
      return () => window.clearTimeout(timer);
    }
    const timers = [
      ...inbound.flatMap((cue) => [
        window.setTimeout(() => store.open(cue.card), fanOpenAtMs(cue)),
        window.setTimeout(() => store.land(cue.card), cue.startMs + cue.durationMs),
      ]),
      ...outbound.map((cue) => window.setTimeout(() => store.depart(cue.card), cue.startMs)),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [inbound, outbound, fxKey, store]);

  return store;
}

export function useArrivalCards(
  events: readonly FxEvent[],
  fxKey: string | number,
  localSeat?: number,
): ArrivalState {
  const store = useArrivalClock(events, fxKey, localSeat);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function ArrivalProvider({
  fx,
  fxKey,
  localSeat,
  children,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  localSeat?: number;
  children: ReactNode;
}) {
  const store = useArrivalClock(fx, fxKey, localSeat);
  return <ArrivalStoreContext.Provider value={store}>{children}</ArrivalStoreContext.Provider>;
}

function useArrivalStore(): ArrivalStore {
  return useContext(ArrivalStoreContext);
}

export function useArrivalState(): ArrivalState {
  const store = useArrivalStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => DEFAULT_ARRIVAL);
}

export function useCardArriving(cardId: string): boolean {
  const store = useArrivalStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.arrivingHas(cardId),
    () => false,
  );
}

export function useCardDeparting(cardId: string): boolean {
  const store = useArrivalStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.departingHas(cardId),
    () => false,
  );
}

export function useFanReceiving(): boolean {
  const store = useArrivalStore();
  return useSyncExternalStore(store.subscribe, store.isReceiving, () => false);
}

/**
 * Drops inbound cards that have not yet been given a gap in the fan.
 *
 * The last admitted order is real state rather than a ref. A departing card
 * has already left `cards`, so its old slot can only come from the previous
 * order — and reading a ref during render can observe a render React threw
 * away, which would strand a card in the wrong slot mid-flight. Reconciling
 * during render (React's documented "adjust state when input changes" path)
 * keeps that read legal without an effect and without a cascading commit:
 * filtering an already-filtered order is idempotent, so this settles in one
 * extra pass and lands on exactly the order the ref produced.
 */
export function useAdmittedHand(cards: readonly string[]): readonly string[] {
  const store = useArrivalStore();
  const { pending, departing } = useSyncExternalStore(
    store.subscribe,
    store.getAdmission,
    store.getAdmission,
  );
  const [previous, setPrevious] = useState<readonly string[]>(cards);
  const admitted = useMemo(() => {
    const base = pending.size === 0 ? [...cards] : cards.filter((card) => !pending.has(card));
    if (departing.size === 0) return pending.size === 0 ? cards : base;
    const baseSet = new Set(base);
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const card of previous) {
      if (departing.has(card) || baseSet.has(card)) {
        kept.push(card);
        seen.add(card);
      }
    }
    for (const card of base) {
      if (!seen.has(card)) kept.push(card);
    }
    return kept;
  }, [cards, pending, departing, previous]);

  if (previous !== admitted && !sameOrder(previous, admitted)) setPrevious(admitted);

  return admitted;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((card, index) => card === right[index]);
}
