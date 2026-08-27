import { describe, expect, it, vi } from 'vitest';
import type { FxEvent } from '@parlour/engine';
import { createFxQueue } from './fx-queue';

const flight = [{ kind: 'card.discard', payload: {}, at: 0 }] as unknown as readonly FxEvent[];
const ring = [{ kind: 'turn.ring', payload: {}, at: 0 }] as unknown as readonly FxEvent[];

function rig(durations: Map<readonly FxEvent[], number>) {
  const published: (readonly FxEvent[])[] = [];
  const queue = createFxQueue({
    publish: (fx) => published.push(fx),
    durationOf: (fx) => durations.get(fx) ?? 100,
  });
  return { published, queue };
}

/*
 * The defect, measured on a real two-human table: a played card's flight was
 * torn out of the DOM 86ms into a 320ms timeline by a follow-up packet that
 * carried nothing but a turn ring. The card stopped moving and appeared on the
 * pile. Solo never showed it — a solo table applies one outcome with one
 * combined timeline.
 */
describe('one burst does not cancel the one still playing', () => {
  it('holds a follow-up until the flight it would interrupt has landed', () => {
    vi.useFakeTimers();
    const { published, queue } = rig(new Map([[flight, 320]]));

    queue.push(flight);
    queue.push(ring);

    expect(published).toEqual([flight]);
    vi.advanceTimersByTime(319);
    expect(published, 'the ring must not land mid-flight').toEqual([flight]);

    vi.advanceTimersByTime(2);
    expect(published).toEqual([flight, ring]);
    vi.useRealTimers();
  });

  it('shows a burst immediately when nothing is moving', () => {
    vi.useFakeTimers();
    const { published, queue } = rig(new Map());

    queue.push(flight);

    expect(published).toEqual([flight]);
    vi.useRealTimers();
  });

  it('ignores an empty burst rather than letting it clear the screen', () => {
    vi.useFakeTimers();
    const { published, queue } = rig(new Map());

    queue.push([]);

    expect(published).toEqual([]);
    vi.useRealTimers();
  });

  /*
   * Play genuinely can outrun the animation — a stacked pickup, a fast
   * exchange. Falling further behind the table every turn is worse than
   * skipping ahead, so the queue keeps what is showing and the newest arrival.
   */
  it('skips ahead rather than falling further behind', () => {
    vi.useFakeTimers();
    const a = ring;
    const b = [{ kind: 'card.draw', payload: {}, at: 0 }] as unknown as readonly FxEvent[];
    const c = [{ kind: 'card.flip', payload: {}, at: 0 }] as unknown as readonly FxEvent[];
    const { published, queue } = rig(new Map([[flight, 100]]));

    queue.push(flight);
    queue.push(a);
    queue.push(b);
    queue.push(c);

    vi.advanceTimersByTime(1_000);
    expect(published[0]).toBe(flight);
    expect(published.at(-1), 'the newest burst still gets shown').toBe(c);
    expect(published).not.toContain(b);
    vi.useRealTimers();
  });

  it('drops everything pending when the room closes', () => {
    vi.useFakeTimers();
    const { published, queue } = rig(new Map([[flight, 320]]));

    queue.push(flight);
    queue.push(ring);
    queue.clear();
    vi.advanceTimersByTime(5_000);

    expect(published).toEqual([flight]);
    vi.useRealTimers();
  });
});
