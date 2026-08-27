'use client';

import { useSyncExternalStore } from 'react';

export type PersistApi = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

const NEVER = () => () => {};

/**
 * False until a persisted setup store has re-read local storage.
 *
 * Create pages used to open the room on the first paint, which still has the
 * shipped defaults. A host who last dealt two-player Wild then watched the
 * lobby draw two chairs while the announcement (and every guest) still said
 * four — Start refused, because the room was not the table they were looking at.
 *
 * A `null` store answers true immediately, which is how a screen says it does
 * not wait. That is a real position rather than a missing one: five create
 * screens shipped without this gate, and the alternative to expressing it here
 * is a conditional hook call at the one place that has to serve all of them.
 */
export function usePersistHydrated(store: PersistApi | null): boolean {
  return useSyncExternalStore(
    store ? (onStoreChange) => store.persist.onFinishHydration(onStoreChange) : NEVER,
    store ? () => store.persist.hasHydrated() : () => true,
    store ? () => false : () => true,
  );
}
