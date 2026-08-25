import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  SimplePool,
  verifyEvent,
  type Event,
  type Filter,
} from 'nostr-tools';
import type { RoomSettings } from './types';

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

type Subscription = { close(): void };

export interface RelayPool {
  ensureRelay(url: string, params?: { connectionTimeout?: number }): Promise<unknown>;
  publish(relays: string[], event: Event, params?: { maxWait?: number }): Promise<string>[];
  querySync(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<Event[]>;
  subscribeMany(
    relays: string[],
    filter: Filter,
    params: { onevent(event: Event): void; maxWait?: number },
  ): Subscription;
  close(relays: string[]): void;
}

export type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export type RoomAnnouncement = {
  hostPubkey: string;
  settings: RoomSettings;
};

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

export class NostrSignaling {
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
