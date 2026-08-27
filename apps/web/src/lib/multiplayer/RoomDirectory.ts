import { SimplePool, verifyEvent, type Event } from 'nostr-tools';
import { validateRoomCode } from '../rooms/code';
import { isMultiplayerGameId, type MultiplayerGameId } from '../rooms/gameIds';
import { hasValidSeatCount } from '../rooms/seatRange';
// From the leaf, not from NostrSignaling — which imports this module back for
// the kinds it publishes, and a cycle through a class module is how a constant
// ends up undefined at import time depending on who was loaded first.
import { DEFAULT_RELAYS, relaysFromEnv, type RelayPool } from './relays';
import type { RoomSecurity } from './types';

/**
 * The open-table directory: a room that wants strangers, and how one is found.
 *
 * Deliberately a SECOND kind rather than a `t` tag on the room announcement
 * that `NostrSignaling` already publishes. Three reasons, in order of how much
 * they would have hurt:
 *
 * 1. `announce` demands a three-relay quorum and throws when it misses, because
 *    a room nobody can resolve is a broken room. A directory row is the
 *    opposite: entirely best-effort, and a failure to publish it must never be
 *    able to take the table down with it.
 * 2. The row carries the host's display name. Folding it into the announcement
 *    would put that name on every room, including the private ones that never
 *    asked to be seen.
 * 3. The row is refreshed on a timer and whenever a chair changes. Republishing
 *    the *join* record that often is how a relay's rate limiter ends up
 *    dropping the record a guest needs.
 *
 * 31289 is addressable (NIP-01 30000–39999) and sits next to the 31288 rooms
 * use, so one host holds exactly one row per code and a refresh replaces the
 * previous one instead of stacking up beside it.
 */
export const OPEN_TABLE_KIND = 31289;

/** The discovery tag every open table carries, and the browse filter matches. */
export const OPEN_TABLE_TAG = 'parlour-open';

/**
 * How long a published row stays believable, in seconds.
 *
 * A listing is a claim that somebody is sitting in a lobby right now, and the
 * only thing that makes it true is that they said so recently. Two and a half
 * minutes is long enough to ride out a phone that slept through one refresh,
 * and short enough that a browser full of tables nobody is at cannot happen —
 * which is the failure that makes a room browser worthless.
 */
export const LISTING_TTL_SECONDS = 150;

/** How often a listed host republishes its row. Comfortably inside the TTL. */
export const LISTING_REFRESH_MS = 60_000;

/** How often the browser drops rows that aged out without being replaced. */
export const LISTING_SWEEP_MS = 15_000;

/** Longest display name a row may carry into someone else's screen. */
const MAX_HOST_NAME = 24;

export type OpenTableListing = {
  code: string;
  hostPubkey: string;
  gameId: MultiplayerGameId;
  /** Chairs at the table. */
  seats: number;
  /** Chairs already taken, house bots included. */
  filled: number;
  hostName: string;
  security: RoomSecurity;
  /** Unix seconds the row was published. */
  listedAt: number;
  /** Unix seconds after which the row is no longer believed. */
  expiresAt: number;
};

/** What a host publishes about itself; the pubkey and clock come from the event. */
export type OwnTableListing = Pick<
  OpenTableListing,
  'code' | 'gameId' | 'seats' | 'filled' | 'hostName' | 'security'
>;

/**
 * The publish half of the directory, kept apart from {@link RoomSignaling}.
 *
 * Signalling is what a room needs to exist; listing is what it needs to be
 * *found*, which not every signalling implementation has any business doing —
 * the hermetic Playwright bridge has no directory at all. Callers therefore ask
 * with {@link canPublishListings} rather than assuming.
 */
export interface RoomListingPublisher {
  /** Publish or refresh this room's row. */
  list(listing: OwnTableListing): Promise<void>;
  /** Withdraw the row, so a live browser drops it immediately. */
  unlist(code: string): Promise<void>;
}

export function canPublishListings(value: unknown): value is RoomListingPublisher {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<RoomListingPublisher>;
  return typeof candidate.list === 'function' && typeof candidate.unlist === 'function';
}

/**
 * A display name from a stranger, made safe to render.
 *
 * Relay content is untrusted input from an unauthenticated author. Control
 * characters and bidi overrides are stripped rather than escaped, because the
 * only thing they can do in a list of table rows is make one row lie about
 * another.
 */
export function sanitizeHostName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(
    /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
    '',
  );
  const trimmed = cleaned.trim().slice(0, MAX_HOST_NAME).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** One row's identity: a host may hold one listing per code, and no more. */
export function listingKey(listing: Pick<OpenTableListing, 'hostPubkey' | 'code'>): string {
  return `${listing.hostPubkey}:${listing.code}`;
}

/** The content a host signs. Withdrawal is the same shape with `closed` set. */
export function listingContent(listing: OwnTableListing): string {
  return JSON.stringify({
    gameId: listing.gameId,
    seats: listing.seats,
    filled: listing.filled,
    hostName: listing.hostName,
    security: listing.security,
  });
}

export function withdrawalContent(): string {
  return JSON.stringify({ closed: true });
}

/**
 * What one relay event says about one table.
 *
 * `listing: null` is a host withdrawing its own row, which is a real statement
 * and not a parse failure — a live browser uses it to remove the table the
 * instant the host leaves, instead of showing it until the TTL runs out.
 * A `null` return is the parse failure: an event that is malformed, forged,
 * expired, or describes a table this build cannot seat.
 */
export type ListingRecord = {
  key: string;
  publishedAt: number;
  listing: OpenTableListing | null;
};

export function readListingEvent(event: Event, nowSeconds: number): ListingRecord | null {
  if (event.kind !== OPEN_TABLE_KIND) return null;
  if (!event.tags.some(([name, value]) => name === 't' && value === OPEN_TABLE_TAG)) return null;

  const rawCode = event.tags.find(([name]) => name === 'd')?.[1];
  const verdict = validateRoomCode(rawCode ?? '');
  if (!verdict.ok) return null;

  const expiration = Number(event.tags.find(([name]) => name === 'expiration')?.[1]);
  if (!Number.isFinite(expiration) || expiration <= nowSeconds) return null;

  // Signature check last: it is the expensive one, and a relay that returns a
  // hundred rows should not pay for it on the ones already thrown out.
  if (!verifyEvent(event)) return null;

  const key = `${event.pubkey}:${verdict.code}`;
  const parsed = parseContent(event.content);
  if (parsed === 'closed') return { key, publishedAt: event.created_at, listing: null };
  if (!parsed) return null;

  return {
    key,
    publishedAt: event.created_at,
    listing: {
      ...parsed,
      code: verdict.code,
      hostPubkey: event.pubkey,
      listedAt: event.created_at,
      expiresAt: expiration,
    },
  };
}

type ParsedContent = Pick<
  OpenTableListing,
  'gameId' | 'seats' | 'filled' | 'hostName' | 'security'
>;

function parseContent(raw: string): ParsedContent | 'closed' | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.closed === true) return 'closed';

  const { gameId, seats, filled, security } = candidate;
  if (!isMultiplayerGameId(gameId)) return null;
  if (typeof seats !== 'number' || !hasValidSeatCount(gameId, seats)) return null;
  if (!Number.isInteger(filled) || (filled as number) < 1 || (filled as number) > seats)
    return null;
  if (security !== undefined && security !== 'open' && security !== 'veil') return null;
  const hostName = sanitizeHostName(candidate.hostName);
  if (!hostName) return null;

  return {
    gameId,
    seats,
    filled: filled as number,
    hostName,
    security: (security as RoomSecurity | undefined) ?? 'open',
  };
}

/**
 * Folds one record into the table being browsed.
 *
 * Returns whether anything changed, so a relay echoing the same refresh from
 * six sockets re-renders the list once rather than six times. Older news never
 * beats newer: relays deliver stored events in no particular order, and a
 * replaced row can arrive after its replacement.
 */
export function applyListingRecord(
  table: Map<string, OpenTableListing>,
  record: ListingRecord,
  seen: Map<string, number>,
): boolean {
  const known = seen.get(record.key);
  if (known !== undefined && known >= record.publishedAt) return false;
  seen.set(record.key, record.publishedAt);
  if (!record.listing) return table.delete(record.key);
  table.set(record.key, record.listing);
  return true;
}

/** Drops rows whose host stopped refreshing them. */
export function sweepListings(table: Map<string, OpenTableListing>, nowSeconds: number): boolean {
  let changed = false;
  for (const [key, listing] of table) {
    if (listing.expiresAt <= nowSeconds) {
      table.delete(key);
      changed = true;
    }
  }
  return changed;
}

/**
 * Browse order: tables you can actually sit at, closest to starting first.
 *
 * A full table is not shown at all — the host withdraws its row when the last
 * chair fills — so the ordering only has to answer "which of these opens
 * soonest", and the answer is the one with the fewest chairs left to fill.
 */
export function sortListings(listings: Iterable<OpenTableListing>): readonly OpenTableListing[] {
  return [...listings].sort((left, right) => {
    const byRemaining = left.seats - left.filled - (right.seats - right.filled);
    if (byRemaining !== 0) return byRemaining;
    if (left.listedAt !== right.listedAt) return right.listedAt - left.listedAt;
    return left.code.localeCompare(right.code);
  });
}

export type OpenTableBrowser = { close(): void };

type BrowseOptions = {
  onChange(listings: readonly OpenTableListing[]): void;
  /** Called once the relays have finished replaying what they had stored. */
  onSettled?: () => void;
  pool?: RelayPool;
  relays?: readonly string[];
  now?: () => number;
  sweepIntervalMs?: number;
};

/**
 * Watches the relays for open tables.
 *
 * Read-only and keyless on purpose: browsing happens on the join screen, which
 * has no room, no transport and no identity yet. Nothing here can announce,
 * answer or join — it hands codes to the page, and the page joins through the
 * ordinary code path with the host pinned.
 */
export function browseOpenTables(options: BrowseOptions): OpenTableBrowser {
  const relays = [
    ...(options.relays ?? relaysFromEnv(process.env.NEXT_PUBLIC_PARLOUR_RELAYS) ?? DEFAULT_RELAYS),
  ];
  const ownsPool = options.pool === undefined;
  const pool: RelayPool =
    options.pool ?? new SimplePool({ enablePing: true, enableReconnect: true });
  const now = options.now ?? (() => Date.now());
  const seconds = () => Math.floor(now() / 1_000);

  const table = new Map<string, OpenTableListing>();
  const seen = new Map<string, number>();
  let closed = false;

  const emit = () => {
    if (!closed) options.onChange(sortListings(table.values()));
  };

  let subscription: { close(): void };
  try {
    subscription = pool.subscribeMany(
      relays,
      {
        kinds: [OPEN_TABLE_KIND],
        '#t': [OPEN_TABLE_TAG],
        since: seconds() - LISTING_TTL_SECONDS,
      },
      {
        maxWait: 5_000,
        onevent: (event) => {
          if (closed) return;
          const record = readListingEvent(event, seconds());
          if (record && applyListingRecord(table, record, seen)) emit();
        },
        oneose: () => {
          if (!closed) options.onSettled?.();
        },
      },
    );
  } catch {
    // Not one relay could be opened. That is an empty list, not a broken
    // screen — and it is reported the same way an empty relay reply is, on a
    // later turn, so a caller never has to handle "threw" separately from
    // "found nothing".
    subscription = { close: () => undefined };
    queueMicrotask(() => {
      if (!closed) options.onSettled?.();
    });
  }

  const sweep = setInterval(() => {
    if (sweepListings(table, seconds())) emit();
  }, options.sweepIntervalMs ?? LISTING_SWEEP_MS);

  return {
    close(): void {
      if (closed) return;
      closed = true;
      clearInterval(sweep);
      subscription.close();
      if (ownsPool) pool.close(relays);
    },
  };
}
