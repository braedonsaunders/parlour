'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { FxEvent } from '@parlour/engine';
import { prefersCalmMotion } from './calm-motion';
import { buildFxTimeline, type FxCue } from './fx-motion';

type InboundCue = Extract<FxCue, { type: 'draw' | 'transfer' }>;
type OutboundCue = Extract<FxCue, { type: 'discard' | 'trick-play' | 'layoff' | 'transfer' }>;

export type ArrivalState = {
  /** Face stays hidden until the flyer covers the slot. */
  arriving: ReadonlySet<string>;
  /** Kept out of the fan until the flight is close enough to need a gap. */
  pending: ReadonlySet<string>;
  /** Still occupying its slot so a discard can leave from that card. */
  departing: ReadonlySet<string>;
};

const EMPTY: ReadonlySet<string> = new Set();
const DEFAULT_STATE: ArrivalState = { arriving: EMPTY, pending: EMPTY, departing: EMPTY };
const ArrivalContext = createContext<ArrivalState>(DEFAULT_STATE);

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

export function useArrivalCards(
  events: readonly FxEvent[],
  fxKey: string | number,
  localSeat?: number,
): ArrivalState {
  const inbound = useMemo(() => inboundArrivalCues(events, localSeat), [events, localSeat]);
  const outbound = useMemo(() => outboundDepartureCues(events, localSeat), [events, localSeat]);
  const [progress, setProgress] = useState<{
    fxKey: string | number | null;
    opened: ReadonlySet<string>;
    landed: ReadonlySet<string>;
    departed: ReadonlySet<string>;
  }>(() => ({ fxKey: null, opened: EMPTY, landed: EMPTY, departed: EMPTY }));
  const opened = progress.fxKey === fxKey ? progress.opened : EMPTY;
  const landed = progress.fxKey === fxKey ? progress.landed : EMPTY;
  const departed = progress.fxKey === fxKey ? progress.departed : EMPTY;

  useLayoutEffect(() => {
    if (inbound.length === 0 && outbound.length === 0) return;
    const reduced = prefersCalmMotion();
    if (reduced) {
      const allIn = new Set(inbound.map((cue) => cue.card));
      const allOut = new Set(outbound.map((cue) => cue.card));
      const timer = window.setTimeout(
        () => setProgress({ fxKey, opened: allIn, landed: allIn, departed: allOut }),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    const timers = [
      ...inbound.flatMap((cue) => [
        window.setTimeout(() => {
          setProgress((current) => {
            const nextOpened = new Set(current.fxKey === fxKey ? current.opened : EMPTY);
            nextOpened.add(cue.card);
            return {
              fxKey,
              opened: nextOpened,
              landed: current.fxKey === fxKey ? current.landed : EMPTY,
              departed: current.fxKey === fxKey ? current.departed : EMPTY,
            };
          });
        }, fanOpenAtMs(cue)),
        window.setTimeout(() => {
          setProgress((current) => {
            const nextLanded = new Set(current.fxKey === fxKey ? current.landed : EMPTY);
            nextLanded.add(cue.card);
            return {
              fxKey,
              opened: current.fxKey === fxKey ? current.opened : EMPTY,
              landed: nextLanded,
              departed: current.fxKey === fxKey ? current.departed : EMPTY,
            };
          });
        }, cue.startMs + cue.durationMs),
      ]),
      ...outbound.map((cue) =>
        window.setTimeout(() => {
          setProgress((current) => {
            const nextDeparted = new Set(current.fxKey === fxKey ? current.departed : EMPTY);
            nextDeparted.add(cue.card);
            return {
              fxKey,
              opened: current.fxKey === fxKey ? current.opened : EMPTY,
              landed: current.fxKey === fxKey ? current.landed : EMPTY,
              departed: nextDeparted,
            };
          });
        }, cue.startMs),
      ),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [inbound, outbound, fxKey]);

  return useMemo(() => {
    if (inbound.length === 0 && outbound.length === 0) return DEFAULT_STATE;
    const arriving = new Set<string>();
    const pending = new Set<string>();
    const departing = new Set<string>();
    for (const cue of inbound) {
      if (!landed.has(cue.card)) arriving.add(cue.card);
      if (!opened.has(cue.card)) pending.add(cue.card);
    }
    for (const cue of outbound) {
      if (!departed.has(cue.card)) departing.add(cue.card);
    }
    return { arriving, pending, departing };
  }, [inbound, outbound, landed, opened, departed]);
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
  const arrival = useArrivalCards(fx, fxKey, localSeat);
  return <ArrivalContext.Provider value={arrival}>{children}</ArrivalContext.Provider>;
}

export function useArrivalState(): ArrivalState {
  return useContext(ArrivalContext);
}

export function useCardArriving(cardId: string): boolean {
  return useContext(ArrivalContext).arriving.has(cardId);
}

export function useCardDeparting(cardId: string): boolean {
  return useContext(ArrivalContext).departing.has(cardId);
}

export function useFanReceiving(): boolean {
  return useContext(ArrivalContext).arriving.size > 0;
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
  const { pending, departing } = useContext(ArrivalContext);
  const [previous, setPrevious] = useState<readonly string[]>(cards);
  const admitted = useMemo(() => {
    const base = pending.size === 0 ? [...cards] : cards.filter((card) => !pending.has(card));
    if (departing.size === 0) return pending.size === 0 ? cards : base;
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const card of previous) {
      if (departing.has(card) || base.includes(card)) {
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
