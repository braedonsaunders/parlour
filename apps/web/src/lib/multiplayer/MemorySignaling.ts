import type { RoomSettings } from './types';
import type { RoomAnnouncement, RoomSignaling, SignalPayload } from './NostrSignaling';
import {
  LISTING_TTL_SECONDS,
  type OpenTableListing,
  type OwnTableListing,
  type RoomListingPublisher,
} from './RoomDirectory';

/**
 * The shared routing layer between {@link MemorySignaling} instances.
 *
 * One bus serves every seat at a table. Each seat's `MemorySignaling` holds
 * its own `publicKey` and forwards the six `RoomSignaling` members onto the
 * bus, keyed by that public key. The bus itself is plain data routing —
 * announce/resolve/deliver/subscribe — with no crypto, because in a hermetic
 * test the bus IS the trusted channel: the point is to exercise the room
 * lifecycle, host election, reconnection and rematch, not the wire encryption
 * (which NostrSignaling's own unit tests already cover).
 *
 * Two implementations matter:
 *
 * - {@link InMemorySignalingBus} runs in one JS world and is what the unit
 *   tests use. It is synchronous, deterministic, and needs no network.
 *
 * - The Playwright multiplayer suite runs each seat in a separate browser
 *   context, so no single JS object can serve them. There the test drives a
 *   bus that lives in the Node process and bridges to each page through
 *   `page.exposeFunction` (page → bus) and `page.evaluate` (bus → page). That
 *   bus implements this same interface, so the seam is the interface — not
 *   the transport behind it.
 */
export interface SignalingBus {
  /** Record a room under `code`, authored by `author`. */
  announce(author: string, code: string, settings: RoomSettings): void;
  /**
   * The most recent room under `code`, or null. `expectedHost` pins the
   * author, mirroring NostrSignaling's host-bound share-link contract.
   */
  resolve(code: string, expectedHost?: string): RoomAnnouncement | null;
  /** Route one signal from `author` to `target`, both public keys. */
  deliver(author: string, code: string, target: string, payload: SignalPayload): void;
  /** Register `receiver` for signals on `code`; returns an unregister fn. */
  onSignal(
    code: string,
    receiver: string,
    callback: (author: string, payload: SignalPayload) => void,
  ): () => void;
  /**
   * Record an open-table row, for buses that model the directory.
   *
   * Optional, because not every bus does. The hermetic Playwright bridge
   * implements this interface across a `page.exposeFunction` boundary and has
   * no directory at all; making these required would break it for a feature it
   * never exercises.
   */
  list?(author: string, listing: OwnTableListing, atMs: number): void;
  /** Withdraw a row this author published. */
  unlist?(author: string, code: string): void;
}

/**
 * A single-process bus: rooms and subscriptions in one Map each.
 *
 * Used by the unit tests and anywhere two seats share a JS world. It keeps the
 * same semantics the real relays have — latest announcement wins, host-bound
 * invites refuse a squatter, and signals reach exactly the named recipient.
 */
export class InMemorySignalingBus implements SignalingBus {
  /** Announcements per code, oldest first — mirrors a relay storing every event. */
  private readonly rooms = new Map<string, RoomAnnouncement[]>();
  private readonly handlers = new Map<
    string,
    Map<string, (author: string, payload: SignalPayload) => void>
  >();
  /** Open-table rows, keyed `author:code` — one per host per code, as on a relay. */
  private readonly tables = new Map<string, OpenTableListing>();

  announce(author: string, code: string, settings: RoomSettings): void {
    const existing = this.rooms.get(code) ?? [];
    this.rooms.set(code, [...existing, { hostPubkey: author, settings }]);
  }

  resolve(code: string, expectedHost?: string): RoomAnnouncement | null {
    const room = this.rooms.get(code);
    if (!room || room.length === 0) return null;
    // A relay returns every event; the latest matching the author wins. When
    // no host is pinned, the newest announcement is authoritative — a
    // squatter can still win the un-pinned case, exactly as on the relays.
    if (expectedHost !== undefined) {
      for (let i = room.length - 1; i >= 0; i--) {
        if (room[i]!.hostPubkey === expectedHost) return room[i]!;
      }
      return null;
    }
    return room[room.length - 1]!;
  }

  deliver(author: string, code: string, target: string, payload: SignalPayload): void {
    this.handlers.get(code)?.get(target)?.(author, payload);
  }

  onSignal(
    code: string,
    receiver: string,
    callback: (author: string, payload: SignalPayload) => void,
  ): () => void {
    const roomHandlers = this.handlers.get(code) ?? new Map();
    roomHandlers.set(receiver, callback);
    this.handlers.set(code, roomHandlers);
    return () => roomHandlers.delete(receiver);
  }

  list(author: string, listing: OwnTableListing, atMs: number): void {
    const listedAt = Math.floor(atMs / 1_000);
    this.tables.set(`${author}:${listing.code}`, {
      ...listing,
      hostPubkey: author,
      listedAt,
      expiresAt: listedAt + LISTING_TTL_SECONDS,
    });
  }

  unlist(author: string, code: string): void {
    this.tables.delete(`${author}:${code}`);
  }

  /** Every open table this bus is currently advertising. For assertions. */
  openTables(): readonly OpenTableListing[] {
    return [...this.tables.values()];
  }
}

/**
 * A `RoomSignaling` whose transport is a {@link SignalingBus}.
 *
 * One instance per seat. It owns nothing but its public key; every message is
 * handed to the shared bus. Because the bus is injected, two seats can sit in
 * different browser contexts and still reach each other through a bus that
 * lives in the test runner.
 */
export class MemorySignaling implements RoomSignaling, RoomListingPublisher {
  readonly publicKey: string;

  constructor(
    publicKey: string,
    private readonly bus: SignalingBus,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.publicKey = publicKey;
  }

  /**
   * Lists the table, when the bus behind this seat models a directory.
   *
   * A bus without one is not an error here: on the relays a listing that
   * reaches nobody is a table nobody browses to, and the room carries on
   * regardless. Silently doing nothing is that same outcome.
   */
  async list(listing: OwnTableListing): Promise<void> {
    this.bus.list?.(this.publicKey, listing, this.now());
  }

  async unlist(code: string): Promise<void> {
    this.bus.unlist?.(this.publicKey, code);
  }

  async announce(code: string, settings: RoomSettings): Promise<void> {
    this.bus.announce(this.publicKey, code, settings);
  }

  async resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement> {
    const room = this.bus.resolve(code, expectedHost);
    if (!room) throw new Error('Room not found, expired, or hosted by a different peer');
    return room;
  }

  async send(code: string, targetPubkey: string, payload: SignalPayload): Promise<void> {
    this.bus.deliver(this.publicKey, code, targetPubkey, payload);
  }

  subscribe(
    code: string,
    callback: (senderPubkey: string, payload: SignalPayload) => void,
  ): { close(): void } {
    const unregister = this.bus.onSignal(code, this.publicKey, callback);
    return { close: unregister };
  }

  close(): void {
    // A shared bus outlives any single seat, so there is nothing per-seat to
    // tear down. NostrSignaling.close() drops relay sockets; the in-memory bus
    // has none. Kept for interface parity.
  }
}
