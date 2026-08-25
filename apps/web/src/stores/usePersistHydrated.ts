'use client';

import { useSyncExternalStore } from 'react';

type PersistApi = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

/**
 * False until a persisted setup store has re-read local storage.
 *
 * Create pages used to open the room on the first paint, which still has the
 * shipped defaults. A host who last dealt two-player Wild then watched the
 * lobby draw two chairs while the announcement (and every guest) still said
 * four — Start refused, because the room was not the table they were looking at.
 */
export function usePersistHydrated(store: PersistApi): boolean {
  return useSyncExternalStore(
    (onStoreChange) => store.persist.onFinishHydration(onStoreChange),
    () => store.persist.hasHydrated(),
    () => false,
  );
}
