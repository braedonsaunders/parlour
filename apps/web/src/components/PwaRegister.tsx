'use client';

import { useEffect, useRef, useState } from 'react';
import { isTauriRuntime, syncAppViewportHeight } from '@/lib/pwa';

export function PwaRegister() {
  const [online, setOnline] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const reloadForUpdate = useRef(false);

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

    const offerUpdate = (worker: ServiceWorker | null) => {
      if (!disposed && worker && navigator.serviceWorker.controller) setWaitingWorker(worker);
    };

    const watchRegistration = (nextRegistration: ServiceWorkerRegistration) => {
      registration = nextRegistration;
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
        watchRegistration(await navigator.serviceWorker.register('/sw.js'));
      } catch (error: unknown) {
        console.warn('[parlour] service worker registration failed', error);
      }
    };

    const checkForUpdate = () => {
      if (!registration || !navigator.onLine || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastUpdateCheck < 60 * 60 * 1000) return;
      lastUpdateCheck = now;
      void registration.update().catch(() => undefined);
    };

    const onControllerChange = () => {
      if (!reloadForUpdate.current) return;
      reloadForUpdate.current = false;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);

    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener('load', register);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    reloadForUpdate.current = true;
    setApplyingUpdate(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  if (online && !waitingWorker) return null;

  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex w-[min(92vw,30rem)] -translate-x-1/2 flex-col gap-2"
    >
      {!online ? (
        <div
          role="status"
          data-testid="pwa-offline-status"
          className="panel-soft pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5 text-left shadow-xl"
        >
          <span aria-hidden="true" className="text-lg text-hearth-200">
            ◌
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-dusk-50">
            Playing offline{' '}
            <span className="font-normal text-dusk-200">· solo games still work</span>
          </p>
        </div>
      ) : null}

      {waitingWorker ? (
        <div
          role="status"
          data-testid="pwa-update-status"
          className="panel-soft pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-xl"
        >
          <span aria-hidden="true" className="text-xl text-hearth-200">
            ✦
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-dusk-50">
            A fresh table is ready.
          </p>
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applyingUpdate}
            className="rounded-full bg-hearth-300 px-3 py-1.5 font-display text-xs font-extrabold text-[#43200a] transition hover:bg-hearth-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-100 disabled:opacity-60"
          >
            {applyingUpdate ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setWaitingWorker(null)}
            aria-label="Dismiss update"
            className="grid h-9 w-9 place-items-center rounded-full text-xl text-dusk-200 transition hover:bg-dusk-800/60 hover:text-dusk-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-100"
          >
            ×
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export default PwaRegister;
