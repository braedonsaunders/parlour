import type { Event, Filter } from 'nostr-tools';

/**
 * The relay list, and the pool shape everything talks to, in one leaf module.
 *
 * Signalling and the open-table directory both need these, and each imports the
 * other's vocabulary — the directory needs a pool, the signalling class needs
 * the directory's kinds. Left where they were, that is an import cycle. Here it
 * is a leaf both sides depend on, and neither depends on the other's module
 * graph to boot.
 */

/**
 * Relays that still accept anonymous writes of parlour's kinds.
 *
 * The previous list (damus / nos.lol / nostr.band / wine / primal) no longer
 * reaches a write quorum: several no longer accept connections, and wine is
 * paid. Creating a room requires three successful publishes, so a list of five
 * with one writer looks like "the app is broken" on every host — Vercel and
 * `next dev` alike, because the browser talks to these relays directly.
 *
 * `NEXT_PUBLIC_PARLOUR_RELAYS` replaces this list at bundle time (comma-
 * separated `wss://` urls), the same way TURN is overridden.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://offchain.pub',
  'wss://nostr.mom',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://relay.mostr.pub',
  'wss://relay.nostr.wirednet.jp',
  'wss://relay.damus.io',
  'wss://nos.lol',
] as const;

export function relaysFromEnv(value: string | undefined): string[] | undefined {
  const urls = (value ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return urls.length > 0 ? urls : undefined;
}

export type Subscription = { close(): void };

export interface RelayPool {
  ensureRelay(url: string, params?: { connectionTimeout?: number }): Promise<unknown>;
  publish(relays: string[], event: Event, params?: { maxWait?: number }): Promise<string>[];
  querySync(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<Event[]>;
  subscribeMany(
    relays: string[],
    filter: Filter,
    params: {
      onevent(event: Event): void;
      /** Fired once the relays finish replaying what they had stored. */
      oneose?(): void;
      maxWait?: number;
    },
  ): Subscription;
  close(relays: string[]): void;
}
