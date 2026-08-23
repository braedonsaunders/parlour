import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  SimplePool,
  type Event,
  type Filter,
} from 'nostr-tools';
import type { RoomSettings } from './types';

const ROOM_KIND = 21088;
const SIGNAL_KIND = 21089;
const ROOM_TTL_SECONDS = 60 * 60 * 4;
const MIN_RELAY_QUORUM = 3;
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.primal.net',
] as const;

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
    this.relays = [...(options.relays ?? DEFAULT_RELAYS)];
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
        kind: ROOM_KIND,
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

  async resolve(code: string): Promise<RoomAnnouncement> {
    const events = await this.pool.querySync(
      this.relays,
      { kinds: [ROOM_KIND], '#d': [code], limit: 10 },
      { maxWait: 5_000 },
    );
    const now = Math.floor(this.now() / 1_000);
    const event = events
      .filter((candidate) => {
        const expiration = candidate.tags.find(([name]) => name === 'expiration')?.[1];
        return expiration !== undefined && Number(expiration) > now;
      })
      .sort((left, right) => right.created_at - left.created_at)[0];
    if (!event) throw new Error('Room not found or expired');
    const settings = JSON.parse(event.content) as RoomSettings;
    if (!settings.gameId || !Number.isInteger(settings.seats))
      throw new Error('Invalid room announcement');
    return { hostPubkey: event.pubkey, settings };
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
