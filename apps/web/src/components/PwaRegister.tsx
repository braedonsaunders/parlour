'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { isTauriRuntime, syncAppViewportHeight } from '@/lib/pwa';

/**
 * A reload is only disruptive where live state would be lost: at a table, in
 * a friend-room flow (the mesh does not survive a reload), or on the podium
 * (whose report lives in client stores). Everywhere else — home, shelves,
 * setup, profile — the app swaps itself for the new version without asking.
 * Judged by route, with the rendered table as a backstop, rather than by
 * importing the multiplayer store into the layout's module graph.
 */
function safeToAutoApply(): boolean {
  const path = window.location.pathname;
  const protectedRoute =
    path.includes('/table') ||
    path.startsWith('/create') ||
    path.startsWith('/join') ||
    path.startsWith('/match-end');
  return !protectedRoute && !document.querySelector('[data-table-screen]');
}

type UpdateReloadIntent = 'automatic' | 'player';
const SAFE_ACTIVATION_MESSAGE = { type: 'SKIP_WAITING', safeReload: true } as const;

export function PwaRegister() {
  const t = useT();
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [deferredReload, setDeferredReload] = useState(false);
  const reloadForUpdate = useRef<UpdateReloadIntent | null>(null);

  useEffect(() => syncAppViewportHeight(), []);

  useEffect(() => {
    const syncConnection = () => setOnline(navigator.onLine);
    syncConnection();
    window.addEventListener('online', syncConnection);
    window.addEventListener('offline', syncConnection);
    return () => {
      window.removeEventListener('online', syncConnection);
      window.removeEventListener('offline', syncConnection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (isTauriRuntime()) return;
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let lastUpdateCheck = 0;

    const activateWorker = (worker: ServiceWorker, intent: UpdateReloadIntent) => {
      reloadForUpdate.current = intent;
      setApplyingUpdate(true);
      worker.postMessage(SAFE_ACTIVATION_MESSAGE);
    };

    const offerUpdate = (worker: ServiceWorker | null) => {
      if (disposed || !worker || !navigator.serviceWorker.controller) return;
      // Away from a live table, don't ask — apply. The prompt is only for the
      // moments where a reload would cost the player something.
      if (safeToAutoApply()) {
        activateWorker(worker, 'automatic');
        return;
      }
      setWaitingWorker(worker);
    };

    const watchRegistration = (nextRegistration: ServiceWorkerRegistration) => {
      registration = nextRegistration;
      // A worker can already be waiting when this component mounts. It still
      // has to pass the same live-game gate as a worker installed moments ago.
      offerUpdate(nextRegistration.waiting);
      nextRegistration.addEventListener('updatefound', () => {
        const worker = nextRegistration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate(nextRegistration.waiting ?? worker);
        });
      });
    };

    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });
        watchRegistration(nextRegistration);
        lastUpdateCheck = Date.now();
        // `register()` already checks the script. Asking the same registration
        // to update before its first install has settled can make WebKit queue
        // an identical second worker, which looks like an update on a device
        // that has never run Parlour before.
      } catch (error: unknown) {
        console.warn('[parlour] service worker registration failed', error);
      }
    };

    const checkForUpdate = () => {
      if (!registration || !navigator.onLine || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastUpdateCheck < 45 * 1000) return;
      lastUpdateCheck = now;
      void registration.update().catch(() => undefined);
    };

    const onControllerChange = () => {
      const intent = reloadForUpdate.current;
      if (!intent) return;
      reloadForUpdate.current = null;
      if (intent === 'player' || safeToAutoApply()) {
        window.location.reload();
        return;
      }

      // Activation may finish after a menu-to-table navigation. The new
      // worker can control this document without replacing it; reload only
      // after the player leaves the live/client-state surface.
      setWaitingWorker(null);
      setApplyingUpdate(false);
      setDeferredReload(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    // A deploy that lands while the tab sits open should not wait for the
    // player to switch tabs: poll for it.
    const updateTimer = window.setInterval(checkForUpdate, 60 * 1000);

    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      disposed = true;
      window.clearInterval(updateTimer);
      window.removeEventListener('load', register);
      window.removeEventListener('online', checkForUpdate);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!deferredReload || !safeToAutoApply()) return;
    window.location.reload();
  }, [deferredReload, pathname]);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    reloadForUpdate.current = 'player';
    setApplyingUpdate(true);
    waitingWorker.postMessage(SAFE_ACTIVATION_MESSAGE);
  };

  if (online && !waitingWorker) return null;

  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex w-[min(calc(100vw-5.5rem),30rem)] flex-col gap-2"
    >
      {!online ? (
        <div
          role="status"
          data-testid="pwa-offline-status"
          className="panel-soft flex items-center gap-3 rounded-full px-4 py-2.5 text-left shadow-xl"
        >
          <span aria-hidden="true" className="text-lg text-hearth-200">
            ◌
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-dusk-50">
            {t('pwa.offline')}{' '}
            <span className="font-normal text-dusk-200">· {t('pwa.offlineSolo')}</span>
          </p>
        </div>
      ) : null}

      {waitingWorker ? (
        <div
          role="status"
          data-testid="pwa-update-status"
          className="panel-soft flex items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-xl"
        >
          <span aria-hidden="true" className="text-xl text-hearth-200">
            ✦
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-dusk-50">
            {t('pwa.updateReady')}
          </p>
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applyingUpdate}
            className="pointer-events-auto rounded-full bg-hearth-300 px-3 py-1.5 font-display text-xs font-extrabold text-[#43200a] transition hover:bg-hearth-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-100 disabled:opacity-60"
          >
            {t(applyingUpdate ? 'pwa.refreshing' : 'pwa.refresh')}
          </button>
          <button
            type="button"
            onClick={() => setWaitingWorker(null)}
            aria-label={t('pwa.dismissUpdate')}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full text-xl text-dusk-200 transition hover:bg-dusk-800/60 hover:text-dusk-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-100"
          >
            ×
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export default PwaRegister;
