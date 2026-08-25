'use client';

import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { FxEvent } from '@parlour/engine';
import { prefersCalmMotion } from './calm-motion';
import {
  buildDealPlan,
  createDealStore,
  LIVE_PHASE,
  LIVE_PILES,
  LIVE_PRESENTATION,
  type DealPhase,
  type DealPiles,
  type DealPresentation,
  type DealStore,
} from './deal-store';

export { buildDealPlan, LIVE_PRESENTATION };
export type { DealPhase, DealPiles, DealPresentation, DealStore };

export type DealPresentationOptions = {
  /**
   * Collapse the deal immediately regardless of the OS media query. The
   * profile's own "reduced motion" switch only sets a CSS class, so without
   * this the JS-timed choreography kept running for someone who explicitly
   * asked it to stop.
   */
  reduced?: boolean;
};

const DealStoreContext = createContext<DealStore | null>(null);

function useDealStoreInstance(): DealStore {
  const storeRef = useRef<DealStore | null>(null);
  if (storeRef.current === null) storeRef.current = createDealStore();
  return storeRef.current;
}

function useDealClock(
  events: readonly FxEvent[],
  fxKey: string | number,
  options: DealPresentationOptions = {},
): DealStore {
  const store = useDealStoreInstance();
  const plan = useMemo(() => {
    try {
      return buildDealPlan(events);
    } catch {
      return null;
    }
  }, [events]);
  store.prepare(fxKey, plan);

  const forceReduced = options.reduced ?? false;

  useLayoutEffect(() => {
    store.flushPrepare();
    if (!plan) return;
    const reduced = forceReduced || prefersCalmMotion();
    if (reduced) {
      const timer = window.setTimeout(() => store.settleAll(plan.cues.map(({ id }) => id)), 0);
      return () => window.clearTimeout(timer);
    }
    const timers = plan.cues.map((cue) =>
      window.setTimeout(() => store.land(cue.id), cue.startMs + cue.durationMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fxKey, plan, forceReduced, store]);

  return store;
}

export function DealProvider({
  fx,
  fxKey,
  reduced,
  children,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  reduced?: boolean;
  children: ReactNode;
}) {
  const store = useDealClock(fx, fxKey, { reduced });
  return createElement(DealStoreContext.Provider, { value: store }, children);
}

function useRequiredDealStore(): DealStore {
  const store = useContext(DealStoreContext);
  if (!store) {
    throw new Error('Deal seat hooks need DealProvider');
  }
  return store;
}

export function useDealStore(): DealStore {
  return useRequiredDealStore();
}

export function useDealPhase(): DealPhase {
  const store = useRequiredDealStore();
  return useSyncExternalStore(store.subscribe, store.getPhase, () => LIVE_PHASE);
}

export function useDealPiles(): DealPiles {
  const store = useRequiredDealStore();
  return useSyncExternalStore(store.subscribe, store.getPiles, () => LIVE_PILES);
}

export function useDealVisibleCount(seat: number, finalCount: number): number {
  const store = useRequiredDealStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.visibleCount(seat, finalCount),
    () => finalCount,
  );
}

export function useDealVisibleCards(cards: readonly string[], seat: number): readonly string[] {
  const store = useRequiredDealStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.visibleCards(cards, seat),
    () => cards,
  );
}

export function useDealPresentation(
  events: readonly FxEvent[],
  fxKey: string | number,
  options: DealPresentationOptions = {},
): DealPresentation {
  const store = useDealClock(events, fxKey, options);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store.getPresentation();
}
