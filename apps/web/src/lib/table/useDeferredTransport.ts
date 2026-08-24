'use client';

import { useEffect, useState, type DependencyList } from 'react';

/**
 * Builds a solo transport one tick after mount.
 *
 * Every table page opened with the same twelve lines: hold the transport in
 * state, construct it inside a `setTimeout(…, 0)`, clear the timer on cleanup,
 * and render a view-less table screen until it arrives. The deferral is not
 * incidental — dealing a full match is enough synchronous work to drop the
 * route transition's first frame, and the wipe that carries a player to the
 * table is the animation most likely to be noticed stuttering.
 *
 * Returns null on the first render, then the transport.
 */
export function useDeferredTransport<T>(
  create: () => T,
  deps: DependencyList,
  /**
   * Tears the transport down when the table unmounts or re-deals. Real-time
   * transports hold timers and subscriptions that outlive the component
   * otherwise — Rat Screw's slap clock kept ticking on an abandoned table
   * before this was threaded through.
   */
  destroy?: (transport: T) => void,
): T | null {
  const [transport, setTransport] = useState<T | null>(null);

  useEffect(() => {
    let live: T | null = null;
    const timer = window.setTimeout(() => {
      live = create();
      setTransport(live);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (live && destroy) destroy(live);
    };
    // `create` closes over the values in `deps`; depending on the closure
    // itself would rebuild the transport — and re-deal the match — on every
    // render. The dependency list is the caller's statement of what a new deal
    // actually depends on, exactly as the hand-written pages spelled it out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return transport;
}
