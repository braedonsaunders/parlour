import type { PersistOptions } from 'zustand/middleware';

/**
 * Solo setup choices outlive the document.
 *
 * A setup store holds what a player picked before dealing: the mode tile, the
 * seat count, the bot tier, and any rule knobs they turned by hand. Those lived
 * in memory only, so anything that reloaded the document quietly reverted them
 * to the shipped defaults — an installed PWA relaunching straight onto the
 * table route, an iOS tab discarded under memory pressure, a refresh mid-hand,
 * or the desktop shell reopening where it left off. Set Wild to two seats, come
 * back, and three bots sit down instead of one.
 *
 * Local storage is the right scope: a table is set up once and played many
 * times, so the choice should still be there tomorrow. What is *not* kept is
 * anything about a match in progress — that belongs to the transport, and
 * `matchFlow` already carries a finished one across a reload.
 */

/** The only fields a setup store keeps; the rest are actions. */
const SETUP_KEYS = ['mode', 'seats', 'botTier', 'overrides'] as const;

/** A slice as it comes back off disk: every field still unknown. */
export type StoredSetup = Partial<Record<(typeof SETUP_KEYS)[number], unknown>>;

/**
 * Persist options for a solo setup store.
 *
 * `sanitize` is where each store re-reads its own stored slice through the same
 * guards its setters use, so a value that was legal in an older release cannot
 * come back and deal an impossible table.
 */
export function setupPersistence<S extends object>(
  name: string,
  sanitize: (stored: StoredSetup) => Partial<S>,
): PersistOptions<S, Partial<S>> {
  return {
    name,
    version: 1,
    partialize: (state) => keptChoices(state),
    // `merge` rather than `migrate`: stored choices are re-validated on every
    // load, not only when the version number moves. A seat count a later
    // release retired is wrong immediately, not one migration from now.
    merge: (stored, current) => ({ ...current, ...sanitize(storedSetup(stored)) }),
  };
}

/** Rule knobs as stored — a plain object or nothing; values are the schema's job. */
export function storedOverrides<C>(value: unknown): Partial<C> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  // Every rules schema resolves through `configSchema.resolve`, which reads only
  // the fields it knows and coerces what it finds, so a stale key here is
  // dropped rather than dealt.
  return { ...(value as Partial<C>) };
}

function keptChoices<S extends object>(state: S): Partial<S> {
  const kept: Record<string, unknown> = {};
  for (const key of SETUP_KEYS) {
    if (key in state) kept[key] = (state as Record<string, unknown>)[key];
  }
  return kept as Partial<S>;
}

function storedSetup(value: unknown): StoredSetup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as StoredSetup;
}
