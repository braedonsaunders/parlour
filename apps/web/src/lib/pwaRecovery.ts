type RecoveryWorker = { scriptURL: string };

type RecoveryRegistration = {
  active?: RecoveryWorker | null;
  waiting?: RecoveryWorker | null;
  installing?: RecoveryWorker | null;
  unregister(): Promise<boolean>;
};

export type PwaRecoveryRuntime = {
  registrations(): Promise<readonly RecoveryRegistration[]>;
  cacheKeys(): Promise<readonly string[]>;
  deleteCache(key: string): Promise<boolean>;
  reload(): void;
};

function isParlourWorker(registration: RecoveryRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  try {
    return new URL(worker.scriptURL, globalThis.location?.origin).pathname === '/sw.js';
  } catch {
    return false;
  }
}

function browserRuntime(): PwaRecoveryRuntime {
  return {
    registrations: async () =>
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [],
    cacheKeys: async () => ('caches' in globalThis ? await caches.keys() : []),
    deleteCache: async (key) => caches.delete(key),
    reload: () => window.location.reload(),
  };
}

/** Removes only Parlour's worker/caches, then reloads the same deep link from the network. */
export async function recoverPwa(runtime: PwaRecoveryRuntime = browserRuntime()): Promise<void> {
  const registrations = await runtime.registrations();
  await Promise.all(
    registrations.filter(isParlourWorker).map((registration) => registration.unregister()),
  );
  const cacheKeys = await runtime.cacheKeys();
  await Promise.all(
    cacheKeys.filter((key) => key.startsWith('parlour-')).map((key) => runtime.deleteCache(key)),
  );
  runtime.reload();
}
