import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePodiumHandoff } from './usePodiumHandoff';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

/**
 * Stands in for a table page: reports the finished match exactly once, from an
 * effect that re-runs on every render because it depends on the snapshot.
 */
function Table({ renders, onPodium }: { renders: number; onPodium: () => void }): ReactNode {
  const handOff = usePodiumHandoff();
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    handOff(900, onPodium);
    // `renders` stands in for the snapshot: a new value on every render.
  }, [handOff, onPodium, renders]);
  return null;
}

describe('usePodiumHandoff', () => {
  it('still reaches the podium when the table re-renders during the hand-off', () => {
    const onPodium = vi.fn();
    act(() => root.render(createElement(Table, { renders: 0, onPodium })));

    // A settling animation, a clock tick, anything at all lands between the win
    // and the hand-off. Clearing the timer from the effect's cleanup used to
    // cancel the navigation here, and the one-shot guard then stopped it ever
    // being re-armed — leaving the winner stuck on a finished table.
    act(() => vi.advanceTimersByTime(200));
    act(() => root.render(createElement(Table, { renders: 1, onPodium })));
    act(() => vi.advanceTimersByTime(200));
    act(() => root.render(createElement(Table, { renders: 2, onPodium })));

    expect(onPodium).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(900));
    expect(onPodium).toHaveBeenCalledTimes(1);
  });

  it('drops the pending navigation when the table unmounts', () => {
    const onPodium = vi.fn();
    act(() => root.render(createElement(Table, { renders: 0, onPodium })));
    act(() => root.render(null));
    act(() => vi.advanceTimersByTime(2_000));
    expect(onPodium).not.toHaveBeenCalled();
  });
});
