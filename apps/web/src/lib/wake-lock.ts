type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
};

/**
 * Holds the screen awake for as long as a table is open.
 *
 * A hand of cards can go a minute without a touch — a bot pause, a friend
 * thinking, a trick playing out — and a phone reading that as idle locks the
 * screen mid-deal. On iOS a locked screen also suspends the tab, which drops
 * the peer connection a friend room is running on, so the cost is not only the
 * black screen.
 *
 * The lock is a request, not a guarantee: browsers refuse it on low battery,
 * in a background tab, or under a policy, and the platform drops it whenever
 * the page is hidden. So this re-asks every time the page comes back into
 * view, and on the first touch after a refusal — Safari has historically
 * wanted a gesture behind the request. Every failure is silent; a table that
 * cannot hold the screen still deals.
 */
export function keepScreenAwake(
  windowValue: Window = window,
  navigatorValue: Navigator = navigator,
): () => void {
  const wakeLock = (navigatorValue as NavigatorWithWakeLock).wakeLock;
  if (!wakeLock) return () => {};

  const doc = windowValue.document;
  let sentinel: WakeLockSentinel | null = null;
  let requesting = false;
  let stopped = false;

  const acquire = async () => {
    if (stopped || sentinel || requesting || doc.visibilityState !== 'visible') return;
    requesting = true;
    try {
      const next = await wakeLock.request('screen');
      // The platform releases the lock on its own when the page is hidden;
      // clearing the handle here is what lets the next `acquire` re-take it.
      next.addEventListener('release', () => {
        if (sentinel === next) sentinel = null;
      });
      if (stopped) {
        void next.release().catch(() => undefined);
      } else {
        sentinel = next;
      }
    } catch {
      sentinel = null;
    } finally {
      requesting = false;
    }
  };

  const reacquire = () => {
    void acquire();
  };

  void acquire();
  doc.addEventListener('visibilitychange', reacquire);
  doc.addEventListener('pointerdown', reacquire);
  windowValue.addEventListener('pageshow', reacquire);

  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', reacquire);
    doc.removeEventListener('pointerdown', reacquire);
    windowValue.removeEventListener('pageshow', reacquire);
    void sentinel?.release().catch(() => undefined);
    sentinel = null;
  };
}
