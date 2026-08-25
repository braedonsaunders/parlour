/**
 * One `MediaQueryList` for "does this player want calm motion", shared by
 * everything that asks.
 *
 * The scene already learned this the hard way and hoisted its two queries out
 * of the frame loop, noting that `matchMedia` "is not free: at 60fps it
 * measured as one of the most expensive single calls in the whole app". The
 * table was making the same call from three places on every burst of effects —
 * the fx timeline, the arrival provider and the deal presentation — each one
 * constructing a fresh `MediaQueryList` and forcing the browser to evaluate the
 * query again, several times a second while cards were in the air.
 *
 * The query is created once, on first ask, and its `matches` is read from
 * there. A `MediaQueryList` stays live for the life of the document, so it
 * answers as the player's setting changes without anybody subscribing.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

let calmQuery: MediaQueryList | null | undefined;

/** True when the OS asks for reduced motion. False anywhere `matchMedia` is absent. */
export function prefersCalmMotion(): boolean {
  if (calmQuery === undefined) {
    calmQuery = typeof window === 'undefined' ? null : (window.matchMedia?.(QUERY) ?? null);
  }
  return calmQuery?.matches ?? false;
}

/** Resets the cached query. Tests swap `window.matchMedia` between cases. */
export function resetCalmMotionQuery(): void {
  calmQuery = undefined;
}
