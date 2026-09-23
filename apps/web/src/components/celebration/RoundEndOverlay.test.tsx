import { act, createElement } from 'react';
import { Fx } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoundEndOverlay } from './RoundEndOverlay';

const FX = [{ kind: Fx.RoundEnd, payload: { reason: 'showdown' } }];
const SEATS = [
  { seat: 0, name: 'Braedon', avatarId: 'ember' },
  { seat: 1, name: 'Slate', avatarId: 'slate' },
];

describe('RoundEndOverlay next hand', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  function render(onNextRound: () => void) {
    act(() =>
      root.render(
        createElement(RoundEndOverlay, {
          fx: FX,
          seats: SEATS,
          livesBySeat: { 0: 2, 1: 1 },
          onNextRound,
        }),
      ),
    );
  }

  it('keeps the automatic handoff deadline when its parent re-renders', () => {
    const first = vi.fn();
    const latest = vi.fn();
    render(first);

    act(() => vi.advanceTimersByTime(300));
    render(latest);
    act(() => vi.advanceTimersByTime(300));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it('presents an explicit ready button for moving on immediately', () => {
    const onNextRound = vi.fn();
    render(onNextRound);

    const button = container.querySelector<HTMLButtonElement>('[data-testid="next-hand"]');
    expect(button?.textContent).toContain('Ready for next hand');

    act(() => button?.click());

    expect(onNextRound).toHaveBeenCalledOnce();
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain('waiting for table');

    act(() => vi.advanceTimersByTime(1_000));
    expect(onNextRound).toHaveBeenCalledOnce();
  });
});
