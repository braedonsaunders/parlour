import { act, useEffect } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDealPresentation, type DealPresentation } from './deal-presentation';

/** Thirteen cards to one seat, every identity withheld — the Spades deal. */
function opaqueDeal(seat = 0, count = 13, stagger = 65): FxEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: Fx.DealCard,
    payload: { card: '??', from: 'stock', to: `hand:${seat}`, dur: 220 },
    at: index * stagger,
  }));
}

/** A face-up deal with distinct identities — the pre-existing behaviour. */
function namedDeal(cards: readonly string[], seat = 0, stagger = 65): FxEvent[] {
  return cards.map((card, index) => ({
    kind: Fx.DealCard,
    payload: { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
    at: index * stagger,
  }));
}

let container: HTMLDivElement;
let root: Root;
/** Published from an effect, so the probe stays pure during render. */
const seen: { current: DealPresentation | null } = { current: null };

function Probe({
  fx,
  fxKey,
  reduced,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  reduced?: boolean;
}) {
  const presentation = useDealPresentation(fx, fxKey, { reduced });
  useEffect(() => {
    seen.current = presentation;
  });
  return null;
}

function render(fx: readonly FxEvent[], fxKey: string | number = 'k', reduced?: boolean) {
  act(() => {
    root.render(<Probe fx={fx} fxKey={fxKey} reduced={reduced} />);
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  seen.current = null;
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  container.remove();
});

const HAND = ['C2', 'C7', 'C13', 'D3', 'D9', 'D12', 'H4', 'H8', 'H11', 'S1', 'S5', 'S10', 'S13'];

describe('useDealPresentation with opaque identities', () => {
  it('holds the whole hand back before anything lands, then reveals all thirteen', () => {
    vi.useFakeTimers();
    render(opaqueDeal());

    // Every card is '??', so identity can never name a cue. Counting distinct
    // ids used to collapse thirteen cues into one and leak the hand at t=0.
    expect(seen.current!.visibleCards(HAND, 0)).toEqual([]);
    expect(seen.current!.visibleCount(0, 13)).toBe(0);
    expect(seen.current!.dealing).toBe(true);

    act(() => void vi.advanceTimersByTime(10_000));
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(HAND);
    expect(seen.current!.visibleCount(0, 13)).toBe(13);
    expect(seen.current!.complete).toBe(true);
  });

  it('never shows more cards than the seat actually holds, at any point', () => {
    vi.useFakeTimers();
    render(opaqueDeal());

    for (let step = 0; step < 20; step++) {
      const count = seen.current!.visibleCount(0, 13);
      const cards = seen.current!.visibleCards(HAND, 0);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(13);
      expect(cards.length).toBeLessThanOrEqual(13);
      // The visible prefix and the counter must agree — a back for every face.
      expect(cards.length).toBe(count);
      act(() => void vi.advanceTimersByTime(120));
    }
  });

  it('reveals the ordered hand as a growing prefix, one card per landed cue', () => {
    vi.useFakeTimers();
    render(opaqueDeal());

    act(() => void vi.advanceTimersByTime(220));
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(HAND.slice(0, 1));

    act(() => void vi.advanceTimersByTime(65 * 4));
    const mid = seen.current!.visibleCards(HAND, 0);
    expect(mid.length).toBeGreaterThan(1);
    expect(mid.length).toBeLessThan(13);
    // A prefix, so the fan never reorders itself mid-deal.
    expect(mid).toEqual(HAND.slice(0, mid.length));
  });

  it('counts opponents by cue too', () => {
    vi.useFakeTimers();
    render(opaqueDeal(2));
    expect(seen.current!.visibleCount(2, 13)).toBe(0);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(seen.current!.visibleCount(2, 13)).toBe(13);
  });
});

describe('useDealPresentation with named identities', () => {
  it('keeps per-card gating for a face-up deal', () => {
    vi.useFakeTimers();
    render(namedDeal(HAND));

    expect(seen.current!.visibleCards(HAND, 0)).toEqual([]);
    expect(seen.current!.visibleCount(0, 13)).toBe(0);

    act(() => void vi.advanceTimersByTime(220));
    // The identity that landed is the one shown, not merely the first in order.
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(['C2']);

    act(() => void vi.advanceTimersByTime(10_000));
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(HAND);
    expect(seen.current!.visibleCount(0, 13)).toBe(13);
  });

  it('passes through cards the deal never planned', () => {
    vi.useFakeTimers();
    render(namedDeal(['C2', 'C7']));
    // A card already in hand before this deal stays visible throughout.
    expect(seen.current!.visibleCards(['S9', 'C2', 'C7'], 0)).toEqual(['S9']);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(seen.current!.visibleCards(['S9', 'C2', 'C7'], 0)).toEqual(['S9', 'C2', 'C7']);
  });

  it('keeps pre-held cards visible when identities are opaque', () => {
    vi.useFakeTimers();
    render(opaqueDeal(0, 2));
    // Two cues, three cards: one was already held, so it never hides.
    expect(seen.current!.visibleCards(['S9', 'C2', 'C7'], 0)).toEqual(['S9']);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(seen.current!.visibleCards(['S9', 'C2', 'C7'], 0)).toEqual(['S9', 'C2', 'C7']);
  });
});

describe('reduced motion', () => {
  it('collapses the deal on the next tick when the profile asks, with matchMedia off', () => {
    vi.useFakeTimers();
    render(opaqueDeal(), 'k', true);
    expect(seen.current!.dealing).toBe(true);

    act(() => void vi.advanceTimersByTime(0));
    expect(seen.current!.complete).toBe(true);
    expect(seen.current!.dealing).toBe(false);
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(HAND);
    expect(seen.current!.visibleCount(0, 13)).toBe(13);
  });

  it('still animates when neither the profile nor the OS asks for calm', () => {
    vi.useFakeTimers();
    render(opaqueDeal(), 'k', false);
    act(() => void vi.advanceTimersByTime(0));
    expect(seen.current!.dealing).toBe(true);
  });
});

describe('no deal in the timeline', () => {
  it('reports a live table that gates nothing', () => {
    render([]);
    expect(seen.current!.sequence).toBe(false);
    expect(seen.current!.dealing).toBe(false);
    expect(seen.current!.visibleCards(HAND, 0)).toEqual(HAND);
    expect(seen.current!.visibleCount(0, 13)).toBe(13);
  });
});
