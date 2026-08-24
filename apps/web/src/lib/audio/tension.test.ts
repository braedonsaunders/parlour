import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TENSE_WINDOW_MS,
  isTenseAt,
  tenseThresholdMs,
  useMatchTension,
  type MatchTensionOptions,
} from './tension';

describe('tense window', () => {
  it('arms in the final minute by default and stays armed past the pace', () => {
    expect(tenseThresholdMs({ expectedMs: 300_000 })).toBe(300_000 - DEFAULT_TENSE_WINDOW_MS);
    expect(isTenseAt(239_999, { expectedMs: 300_000 })).toBe(false);
    expect(isTenseAt(240_000, { expectedMs: 300_000 })).toBe(true);
    expect(isTenseAt(600_000, { expectedMs: 300_000 })).toBe(true);
  });

  it('honours a real countdown window when a game has one', () => {
    expect(isTenseAt(150_000, { expectedMs: 180_000, windowMs: 30_000 })).toBe(true);
    expect(isTenseAt(149_000, { expectedMs: 180_000, windowMs: 30_000 })).toBe(false);
  });
});

describe('useMatchTension', () => {
  let container: HTMLDivElement;
  let root: Root;
  let tense = false;

  function Probe(props: MatchTensionOptions) {
    tense = useMatchTension(props);
    return null;
  }

  function render(node: ReactNode): void {
    act(() => root.render(node));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  it('turns tense once the running clock reaches the window and releases at the end', () => {
    render(createElement(Probe, { expectedMs: 300_000, running: true }));
    expect(tense).toBe(false);

    act(() => void vi.advanceTimersByTime(239_000));
    expect(tense).toBe(false);

    act(() => void vi.advanceTimersByTime(2_000));
    expect(tense).toBe(true);

    render(createElement(Probe, { expectedMs: 300_000, running: false }));
    expect(tense).toBe(false);
  });

  it('pauses the clock while the match is not running and restarts on a new match', () => {
    render(createElement(Probe, { expectedMs: 300_000, running: true, resetKey: 'match-1' }));
    act(() => void vi.advanceTimersByTime(200_000));

    render(createElement(Probe, { expectedMs: 300_000, running: false, resetKey: 'match-1' }));
    act(() => void vi.advanceTimersByTime(600_000));

    render(createElement(Probe, { expectedMs: 300_000, running: true, resetKey: 'match-1' }));
    act(() => void vi.advanceTimersByTime(39_000));
    expect(tense).toBe(false);
    act(() => void vi.advanceTimersByTime(2_000));
    expect(tense).toBe(true);

    render(createElement(Probe, { expectedMs: 300_000, running: true, resetKey: 'match-2' }));
    expect(tense).toBe(false);
    act(() => void vi.advanceTimersByTime(239_000));
    expect(tense).toBe(false);
  });
});
