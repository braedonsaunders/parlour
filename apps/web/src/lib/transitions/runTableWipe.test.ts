import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWipeStore } from '@/stores/wipe';
import { runTableWipe } from './runTableWipe';
import { WIPE_TIMINGS } from './tableWipe';

vi.mock('@/lib/audio/AudioManager', () => ({
  getAudioManager: () => ({ play: vi.fn() }),
}));

const status = () => useWipeStore.getState().status;

/** Stands in for Next swapping the route: the overlay reports the landing. */
const navigateAndArrive = () => useWipeStore.getState().markArrived();

beforeEach(() => {
  vi.useFakeTimers();
  useWipeStore.setState({ status: 'idle', target: null, origin: null, arrived: false });
  document.documentElement.classList.remove('reduce-motion');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runTableWipe', () => {
  it('holds the navigation until the screen is covered, then reveals the table', async () => {
    const nav = vi.fn(navigateAndArrive);
    runTableWipe(nav, '/spades/table', '/spades');

    // Nothing has moved yet: the panels are still sweeping in.
    expect(status()).toBe('cover');
    expect(useWipeStore.getState().target).toBe('/spades/table');
    expect(nav).not.toHaveBeenCalled();

    // The route swaps only once the overlay is opaque, so neither the outgoing
    // nor the incoming page is ever on screen mid-swap.
    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.coverMs);
    expect(status()).toBe('covered');
    expect(nav).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.holdMs);
    expect(status()).toBe('reveal');

    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.revealMs);
    expect(status()).toBe('idle');
    expect(useWipeStore.getState().target).toBeNull();
  });

  it('reveals on the safety window when the route never announces itself', async () => {
    runTableWipe(() => {}, '/gin/table', '/gin');

    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.coverMs + WIPE_TIMINGS.holdMs);
    expect(status()).toBe('covered');

    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.arrivalSafetyMs + 100);
    expect(status()).toBe('reveal');

    await vi.advanceTimersByTimeAsync(WIPE_TIMINGS.revealMs);
    expect(status()).toBe('idle');
  });

  it('navigates straight through when motion is turned down', () => {
    document.documentElement.classList.add('reduce-motion');
    const nav = vi.fn();

    runTableWipe(nav, '/hearts/table', '/hearts');

    expect(nav).toHaveBeenCalledTimes(1);
    expect(status()).toBe('idle');
  });

  it('does not stack a second wipe on top of one already running', async () => {
    const first = vi.fn(navigateAndArrive);
    const second = vi.fn();

    runTableWipe(first, '/wild/table', '/wild');
    runTableWipe(second, '/gin/table', '/gin');

    // The interloper goes through immediately rather than restarting the
    // panels, which would leave the first journey's timers rewriting the store.
    expect(second).toHaveBeenCalledTimes(1);
    expect(useWipeStore.getState().target).toBe('/wild/table');

    await vi.advanceTimersByTimeAsync(
      WIPE_TIMINGS.coverMs + WIPE_TIMINGS.holdMs + WIPE_TIMINGS.revealMs,
    );
    expect(status()).toBe('idle');
  });
});
