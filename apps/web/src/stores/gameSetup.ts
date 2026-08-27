'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * One store for every game's setup, with a per-game document inside it.
 *
 * There were nineteen setup stores. They were not nineteen different ideas —
 * they were one idea written nineteen times, each with its own zustand store,
 * its own localStorage key, its own persist wiring and its own copy of the same
 * clamp-on-read discipline. Adding a game meant writing all of that again, and
 * the fourteenth copy is where a default quietly stops matching the other
 * thirteen.
 *
 * So the store here knows nothing about any game. It holds a bag of opaque JSON
 * documents keyed by game id — the flexible column — and every question about
 * what belongs in one is answered by that game's {@link SetupSchema}. Blitz
 * keeps a mode, seats and a bot tier; Klondike keeps a mode and a winnable-only
 * flag; Wild keeps all of that plus a bag of rule overrides. None of those
 * shapes is written down here, and none of them has to be.
 *
 * Adding a game is one `defineSetup` call. There is no store to create, no key
 * to invent and no persistence to wire.
 */

/** One game's saved setup. The shape is the game's business, not this store's. */
export type SetupDoc = Record<string, unknown>;

export type SetupSchema<T extends SetupDoc> = {
  /** What a game nobody has set up yet looks like. */
  defaults: T;
  /**
   * Everything read back off disk, forced into a value THIS build accepts.
   *
   * Runs on rehydrate and on every write, not only when a version number moves:
   * a seat count a later release retired is wrong immediately, not one
   * migration from now. This is the same guarantee the nineteen stores each
   * made through `setupPersistence`, in the one place that can now make it.
   */
  coerce(stored: SetupDoc): T;
};

type SetupDb = {
  /** Persisted. One document per game. */
  docs: Readonly<Record<string, SetupDoc>>;
  /**
   * NOT persisted. A deal in progress is a session, not a setting — the four
   * solitaires park their live run here so it survives a route change and
   * nothing more.
   */
  runs: Readonly<Record<string, unknown>>;
  write(gameId: string, doc: SetupDoc): void;
  putRun(gameId: string, run: unknown): void;
};

export const SETUP_DB_STORAGE_KEY = 'parlour.setup.v2';

/**
 * Where a game's setup lived before there was one store.
 *
 * Read once, on the first load after upgrading, and never written to. A player
 * who set Wild to two seats last week must not come back to four — and leaving
 * the old keys in place means rolling this release back does not strand them
 * either.
 */
function legacyKey(gameId: string): string {
  return `parlour.${gameId}.setup.v1`;
}

function readLegacy(gameId: string): SetupDoc | null {
  try {
    const raw = localStorage.getItem(legacyKey(gameId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // zustand's persist envelope is `{ state, version }`; the slice is inside.
    const state = (parsed as { state?: unknown } | null)?.state;
    return state && typeof state === 'object' && !Array.isArray(state) ? (state as SetupDoc) : null;
  } catch {
    // Private mode, a corrupt entry, or storage that refuses. Defaults are a
    // perfectly good answer; a thrown error on boot is not.
    return null;
  }
}

export const useGameSetupDb = create<SetupDb>()(
  persist(
    (set) => ({
      docs: {},
      runs: {},
      write: (gameId, doc) => set((db) => ({ docs: { ...db.docs, [gameId]: doc } })),
      putRun: (gameId, run) => set((db) => ({ runs: { ...db.runs, [gameId]: run } })),
    }),
    {
      name: SETUP_DB_STORAGE_KEY,
      version: 1,
      partialize: (db) => ({ docs: db.docs }),
      // Stored documents are taken as they are and coerced per game on read,
      // NOT here. The store is created while this module is evaluated, which is
      // before any game has had a chance to register a schema — coercing at
      // rehydrate would run against an empty registry and quietly reset every
      // saved choice on the first load after upgrading.
      merge: (stored, current) => ({ ...current, docs: readDocs(stored) }),
    },
  ),
);

function readDocs(stored: unknown): Record<string, SetupDoc> {
  const docs = (stored as { docs?: unknown } | null)?.docs;
  return docs && typeof docs === 'object' && !Array.isArray(docs)
    ? (docs as Record<string, SetupDoc>)
    : {};
}

/** What a game's own module gets to read and write its document with. */
export type SetupApi<T extends SetupDoc> = {
  get(): T;
  patch(partial: Partial<T>): void;
  reset(): void;
  getRun<R>(): R | null;
  putRun(run: unknown): void;
};

/**
 * A game's setup, shaped like the bound zustand store it replaced.
 *
 * Callable with a selector, with `getState()` beside it and a `persist` handle
 * for {@link usePersistHydrated}. That is deliberate: it kept sixty-odd call
 * sites from changing, which is the difference between a refactor that can be
 * reviewed and one that has to be trusted.
 */
export type SetupStore<V> = {
  <S>(selector: (state: V) => S): S;
  getState(): V;
  /** Write straight into the document, coerced. Tests use this; screens do not. */
  setState(partial: Partial<V>): void;
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
    rehydrate: () => Promise<void> | void;
  };
};

/**
 * Registers one game's setup and returns the handle its screens use.
 *
 * `makeActions` is where a game says what its setters are — `setSeats`,
 * `setRule`, `start`, whatever it actually has. They are built once, so the
 * function identity a selector returns is stable and `useStore(s => s.setMode)`
 * does not re-render on every write.
 */
export function defineSetup<T extends SetupDoc, A extends object, Run = never>(
  gameId: string,
  schema: SetupSchema<T>,
  makeActions: (api: SetupApi<T>) => A,
): SetupStore<T & A & { run: Run | null }> {
  /**
   * The stored document, coerced, memoised on the raw object it came from.
   *
   * Coercion happens here rather than at rehydrate because a game registers
   * itself after the store exists. Memoising on identity keeps that free: the
   * raw document only changes when something is written, so the coerced value
   * is computed once per write rather than once per render — and, just as
   * importantly, keeps returning the SAME object, which is what lets a selector
   * reaching for `overrides` avoid re-rendering forever.
   */
  let docsSeen: unknown = Symbol('unread');
  let coerced: T = schema.defaults;

  const read = (): T => {
    const docs = useGameSetupDb.getState().docs;
    if (docs === docsSeen) return coerced;
    docsSeen = docs;
    // No document under the one store yet means this may be a player upgrading,
    // whose choices are still sitting under the old per-game key.
    coerced = schema.coerce(docs[gameId] ?? readLegacy(gameId) ?? {});
    return coerced;
  };

  const api: SetupApi<T> = {
    get: read,
    patch: (partial) =>
      useGameSetupDb.getState().write(gameId, schema.coerce({ ...read(), ...partial })),
    reset: () => useGameSetupDb.getState().write(gameId, schema.defaults),
    getRun: <R>() => (useGameSetupDb.getState().runs[gameId] as R | undefined) ?? null,
    putRun: (run) => useGameSetupDb.getState().putRun(gameId, run),
  };

  const actions = makeActions(api);

  // The view is rebuilt only when the underlying document or run changes, so a
  // selector that reaches for an action gets the same object — and the same
  // function — every render until something actually moves.
  type View = T & A & { run: Run | null };
  let cachedDoc: T | undefined;
  let cachedRun: unknown;
  let cachedView: View;
  const view = (): View => {
    const doc = read();
    const run = useGameSetupDb.getState().runs[gameId] ?? null;
    if (doc !== cachedDoc || run !== cachedRun || cachedView === undefined) {
      cachedDoc = doc;
      cachedRun = run;
      cachedView = { ...doc, run, ...actions } as View;
    }
    return cachedView;
  };

  // The server render sees defaults and no run, which is what every one of
  // these stores rendered before hydration anyway.
  const serverView = { ...schema.defaults, run: null, ...actions } as View;

  const store = (<S>(selector: (state: View) => S): S =>
    useSyncExternalStore(
      useGameSetupDb.subscribe,
      () => selector(view()),
      () => selector(serverView),
    )) as SetupStore<View>;

  store.getState = view;
  store.setState = (partial) => {
    const { run, ...rest } = partial as Record<string, unknown>;
    if ('run' in partial) api.putRun(run);
    if (Object.keys(rest).length > 0) api.patch(rest as Partial<T>);
  };
  store.persist = {
    hasHydrated: () => useGameSetupDb.persist.hasHydrated(),
    onFinishHydration: (fn) => useGameSetupDb.persist.onFinishHydration(fn),
    rehydrate: () => useGameSetupDb.persist.rehydrate(),
  };
  return store;
}
