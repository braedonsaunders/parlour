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
  /**
   * Bursts accepted but not yet shown, whenever that set changes.
   *
   * Only the presentation waits here; the game state that came with these
   * bursts was published the moment it arrived. So between the two there is a
   * window where a card is already in the hand and the flight that carries it
   * there has not started — which is exactly what a player saw as a pickup
   * blinking into the fan, vanishing, and then flying in properly. Handing the
   * table what is still waiting lets it hold those cards back for the gap.
   */
  waiting?(fx: readonly FxEvent[]): void;
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
  waiting,
  durationOf,
  maxPending = 3,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: FxQueueOptions): FxQueue {
  const pending: (readonly FxEvent[])[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let announced: readonly FxEvent[] = [];

  /** Everything behind the burst on screen — `pending[0]` is the one showing. */
  function announceWaiting(): void {
    if (!waiting) return;
    const queued = pending.length > 1 ? pending.slice(1).flat() : [];
    if (sameEvents(announced, queued)) return;
    announced = queued;
    waiting(queued);
  }

  function drain(): void {
    const next = pending[0];
    if (!next) return;
    publish(next);
    // After the publish, so the burst that just went on screen and the shorter
    // wait behind it reach the table in one batch and no card changes hands twice.
    announceWaiting();
    timer = setTimer(
      () => {
        timer = null;
        pending.shift();
        drain();
        if (pending.length === 0) announceWaiting();
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
      else announceWaiting();
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending.length = 0;
      announceWaiting();
    },
  };
}

function sameEvents(left: readonly FxEvent[], right: readonly FxEvent[]): boolean {
  return left.length === right.length && left.every((event, index) => event === right[index]);
}
