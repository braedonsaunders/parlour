import type { FxEvent } from '@parlour/engine';

/**
 * Plays one fx burst after another instead of on top of it.
 *
 * A friend room applies a single move as several packets, and publishing each
 * one's fx replaced the last: new events, new key, cue elements remounted, the
 * animation context reverted. Measured on a two-human table, one played card
 * produced
 *
 *   10ms  [card.discard, turn.ring]   the flight starts
 *   86ms  [turn.ring]                 the discard cue is gone, mid-air
 *
 * so the card travelled for eighty milliseconds and then appeared on the pile.
 * A solo table never showed it, because it applies one outcome carrying one
 * combined timeline; only a room has follow-up packets — a turn ring, a settle
 * — that can land while a card is still moving.
 *
 * Game state is published immediately and stays authoritative. Only the
 * PRESENTATION waits its turn, which is what the timeline already does between
 * cues inside a single burst.
 */
export interface FxQueue {
  /** Show this burst, after whatever is already moving has landed. */
  push(fx: readonly FxEvent[]): void;
  /** Drop anything pending; the room is closing or starting over. */
  clear(): void;
}

export interface FxQueueOptions {
  publish(fx: readonly FxEvent[]): void;
  durationOf(fx: readonly FxEvent[]): number;
  /**
   * Bursts allowed to back up before the queue starts dropping. Play outrunning
   * the animation is a real state — a stacked pickup, a fast exchange — and
   * falling further and further behind the table is worse than skipping ahead.
   */
  maxPending?: number;
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function createFxQueue({
  publish,
  durationOf,
  maxPending = 3,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: FxQueueOptions): FxQueue {
  const pending: (readonly FxEvent[])[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function drain(): void {
    const next = pending[0];
    if (!next) return;
    publish(next);
    timer = setTimer(
      () => {
        timer = null;
        pending.shift();
        drain();
      },
      Math.max(1, durationOf(next)),
    );
  }

  return {
    push(fx) {
      // Nothing to show must not cancel what is showing.
      if (fx.length === 0) return;
      if (pending.length >= maxPending) pending.splice(1);
      pending.push(fx);
      if (pending.length === 1) drain();
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending.length = 0;
    },
  };
}
