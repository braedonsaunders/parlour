import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  SimplePool,
  verifyEvent,
} from 'nostr-tools';
import {
  LISTING_TTL_SECONDS,
  OPEN_TABLE_KIND,
  OPEN_TABLE_TAG,
  listingContent,
  withdrawalContent,
  type OwnTableListing,
  type RoomListingPublisher,
} from './RoomDirectory';
import { DEFAULT_RELAYS, relaysFromEnv, type RelayPool, type Subscription } from './relays';
import type { RoomSettings } from './types';

export { DEFAULT_RELAYS, relaysFromEnv, type RelayPool };

/**
 * Addressable room directory (NIP-01 30000–39999).
 *
 * Kind 21088 used to look "ephemeral" in the spec sense, and public relays now
 * treat it that way: they ACK the publish, then drop the event. Guests resolve
 * rooms with `querySync`, which only sees stored events, so a directory kind
 * that is not stored cannot be joined. 31288 keeps the old 288 suffix and is
 * replaceable per host+`d` (the room code), which is the shape a 4-hour table
 * actually needs.
 */
export const ROOM_ANNOUNCEMENT_KIND = 31288;
export const SIGNAL_KIND = 21089;
const ROOM_TTL_SECONDS = 60 * 60 * 4;
const MIN_RELAY_QUORUM = 3;

export type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export type RoomAnnouncement = {
  hostPubkey: string;
  settings: RoomSettings;
};

/**
 * The signaling surface a room consumes.
 *
 * This is the seam that makes the friend-room mesh testable without public
 * Nostr relays: `NostrSignaling` is one implementation, and
 * `MemorySignaling` (see MemorySignaling.ts) is another that routes the same
 * six members over a bus two browser contexts can share.
 *
 * The six members are exactly what `P2PTransport` calls — `publicKey`,
 * `announce`, `resolve`, `send`, `subscribe`, `close`. `healthyRelays` is a
 * Nostr detail and deliberately NOT part of the interface: an in-memory
 * transport has no relays to check.
 */
export interface RoomSignaling {
  /** This peer's identity — the value other peers address signals to. */
  readonly publicKey: string;
  /** Publish this room under `code` so peers can resolve it. */
  announce(code: string, settings: RoomSettings): Promise<void>;
  /** Look up a room by code; `expectedHost` pins a share-link invite. */
  resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement>;
  /** Deliver one signal to a specific peer. */
  send(code: string, targetPubkey: string, payload: SignalPayload): Promise<void>;
  /** Receive signals addressed to this peer. */
  subscribe(
    code: string,
    callback: (senderPubkey: string, payload: SignalPayload) => void,
  ): { close(): void };
  /** Release every subscription and connection this peer opened. */
  close(): void;
}

function parseRoomSettings(content: string): RoomSettings | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.gameId !== 'string' ||
      candidate.gameId.length === 0 ||
      candidate.gameId.length > 64 ||
      !Number.isInteger(candidate.seats) ||
      (candidate.seats as number) < 2 ||
      (candidate.seats as number) > 8 ||
      !candidate.config ||
      typeof candidate.config !== 'object' ||
      Array.isArray(candidate.config) ||
      (candidate.security !== undefined &&
        candidate.security !== 'open' &&
        candidate.security !== 'veil')
    ) {
      return null;
    }
    return candidate as RoomSettings;
  } catch {
    return null;
  }
}

type SignalingOptions = {
  relays?: readonly string[];
  pool?: RelayPool;
  secretKey?: Uint8Array;
  now?: () => number;
};

export class NostrSignaling implements RoomSignaling, RoomListingPublisher {
  readonly publicKey: string;
  private readonly relays: string[];
  private readonly pool: RelayPool;
  private readonly secretKey: Uint8Array;
  private readonly now: () => number;

  constructor(options: SignalingOptions = {}) {
    this.relays = [
      ...(options.relays ??
        relaysFromEnv(process.env.NEXT_PUBLIC_PARLOUR_RELAYS) ??
        DEFAULT_RELAYS),
    ];
    this.pool = options.pool ?? new SimplePool({ enablePing: true, enableReconnect: true });
    this.secretKey = options.secretKey ?? generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
    this.now = options.now ?? (() => Date.now());
  }

  async healthyRelays(): Promise<string[]> {
    const checks = await Promise.allSettled(
      this.relays.map(async (relay) => {
        await this.pool.ensureRelay(relay, { connectionTimeout: 4_000 });
        return relay;
      }),
    );
    return checks
      .filter((check): check is PromiseFulfilledResult<string> => check.status === 'fulfilled')
      .map((check) => check.value);
  }

  async announce(code: string, settings: RoomSettings): Promise<void> {
    const healthy = await this.healthyRelays();
    if (healthy.length < MIN_RELAY_QUORUM) throw new Error('Nostr relay quorum unavailable');
    const createdAt = Math.floor(this.now() / 1_000);
    const event = finalizeEvent(
      {
        kind: ROOM_ANNOUNCEMENT_KIND,
        created_at: createdAt,
        tags: [
          ['d', code],
          ['expiration', String(createdAt + ROOM_TTL_SECONDS)],
        ],
        content: JSON.stringify(settings),
      },
      this.secretKey,
    );
    const results = await Promise.allSettled(this.pool.publish(healthy, event, { maxWait: 5_000 }));
    if (results.filter((result) => result.status === 'fulfilled').length < MIN_RELAY_QUORUM) {
      throw new Error('Nostr relay quorum unavailable');
    }
  }

  /**
   * Publishes or refreshes this room's open-table row.
   *
   * Signed with the same key as the room announcement, which is the point: the
   * browser hands the row's pubkey straight back to `join` as `expectedHost`,
   * so picking a table off a public list is host-pinned in the way a typed code
   * can never be.
   *
   * Best-effort by design — one relay is enough, and unlike {@link announce}
   * there is no quorum. A row that reaches fewer relays is a table fewer people
   * see; a room that reaches fewer relays is a table nobody can join.
   */
  async list(listing: OwnTableListing): Promise<void> {
    await this.publishListing(listing.code, listingContent(listing));
  }

  /**
   * Withdraws the row.
   *
   * Relays have no reliable delete, so this is a replacement that says `closed`
   * rather than an erasure: addressable events supersede in place, and a
   * browser watching live drops the table the moment it arrives instead of
   * waiting out the TTL.
   */
  async unlist(code: string): Promise<void> {
    await this.publishListing(code, withdrawalContent());
  }

  private async publishListing(code: string, content: string): Promise<void> {
    const createdAt = Math.floor(this.now() / 1_000);
    const event = finalizeEvent(
      {
        kind: OPEN_TABLE_KIND,
        created_at: createdAt,
        tags: [
          ['d', code],
          ['t', OPEN_TABLE_TAG],
          ['expiration', String(createdAt + LISTING_TTL_SECONDS)],
        ],
        content,
      },
      this.secretKey,
    );
    const results = await Promise.allSettled(
      this.pool.publish(this.relays, event, { maxWait: 5_000 }),
    );
    if (!results.some((result) => result.status === 'fulfilled')) {
      throw new Error('Unable to publish the table listing');
    }
  }

  async resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement> {
    if (expectedHost !== undefined && !/^[0-9a-f]{64}$/.test(expectedHost)) {
      throw new Error('Invalid room host public key');
    }
    const events = await this.pool.querySync(
      this.relays,
      {
        kinds: [ROOM_ANNOUNCEMENT_KIND],
        '#d': [code],
        ...(expectedHost ? { authors: [expectedHost] } : {}),
        limit: 10,
      },
      { maxWait: 5_000 },
    );
    const now = Math.floor(this.now() / 1_000);
    const announcement = events
      .flatMap((candidate) => {
        if (!verifyEvent(candidate)) return [];
        if (expectedHost !== undefined && candidate.pubkey !== expectedHost) return [];
        const expiration = candidate.tags.find(([name]) => name === 'expiration')?.[1];
        const settings = parseRoomSettings(candidate.content);
        return expiration !== undefined && Number(expiration) > now && settings
          ? [{ event: candidate, settings }]
          : [];
      })
      .sort((left, right) => right.event.created_at - left.event.created_at)[0];
    if (
      !announcement ||
      (expectedHost !== undefined && announcement.event.pubkey !== expectedHost)
    ) {
      throw new Error('Room not found, expired, or hosted by a different peer');
    }
    return { hostPubkey: announcement.event.pubkey, settings: announcement.settings };
  }

  async send(code: string, targetPubkey: string, payload: SignalPayload): Promise<void> {
    const conversationKey = nip44.v2.utils.getConversationKey(this.secretKey, targetPubkey);
    const event = finalizeEvent(
      {
        kind: SIGNAL_KIND,
        created_at: Math.floor(this.now() / 1_000),
        tags: [
          ['p', targetPubkey],
          ['d', code],
        ],
        content: nip44.v2.encrypt(JSON.stringify(payload), conversationKey),
      },
      this.secretKey,
    );
    const results = await Promise.allSettled(
      this.pool.publish(this.relays, event, { maxWait: 5_000 }),
    );
    if (!results.some((result) => result.status === 'fulfilled')) {
      throw new Error('Unable to publish signaling message');
    }
  }

  subscribe(
    code: string,
    callback: (senderPubkey: string, payload: SignalPayload) => void,
  ): Subscription {
    return this.pool.subscribeMany(
      this.relays,
      {
        kinds: [SIGNAL_KIND],
        '#p': [this.publicKey],
        '#d': [code],
        since: Math.floor(this.now() / 1_000) - 10,
      },
      {
        maxWait: 5_000,
        onevent: (event) => {
          try {
            const conversationKey = nip44.v2.utils.getConversationKey(this.secretKey, event.pubkey);
            const payload = JSON.parse(
              nip44.v2.decrypt(event.content, conversationKey),
            ) as SignalPayload;
            if (payload.type === 'offer' || payload.type === 'answer' || payload.type === 'ice') {
              callback(event.pubkey, payload);
            }
          } catch {
            // Malformed or undecryptable third-party relay events are untrusted input.
          }
        },
      },
    );
  }

  close(): void {
    this.pool.close(this.relays);
  }
}
