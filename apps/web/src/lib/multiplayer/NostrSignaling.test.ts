import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  type Event,
  type Filter,
} from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RELAYS,
  NostrSignaling,
  ROOM_ANNOUNCEMENT_KIND,
  relaysFromEnv,
  type RelayPool,
} from './NostrSignaling';
import { InMemorySignalingBus, MemorySignaling } from './MemorySignaling';

function fakePool(
  failing = new Set<string>(),
  queryEvents: Event[] = [],
): RelayPool & { events: Array<Record<string, unknown>>; queries: Filter[] } {
  const events: Array<Record<string, unknown>> = [];
  const queries: Filter[] = [];
  return {
    events,
    queries,
    ensureRelay: async (url) => {
      if (failing.has(url)) throw new Error('offline');
    },
    publish: (relays, event) => {
      events.push(event as unknown as Record<string, unknown>);
      return relays.map((url) =>
        failing.has(url) ? Promise.reject(new Error('offline')) : Promise.resolve('ok'),
      );
    },
    querySync: async (_relays, filter) => {
      queries.push(filter);
      return queryEvents;
    },
    subscribeMany: () => ({ close() {} }),
    close() {},
  };
}

describe('Nostr signaling', () => {
  it('requires room announcements to reach at least three healthy relays', async () => {
    const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test', 'wss://four.test'];
    const pool = fakePool(new Set(['wss://three.test', 'wss://four.test']));
    const signaling = new NostrSignaling({ relays, pool });
    await expect(
      signaling.announce('AB2Z', { gameId: 'blitz', seats: 4, config: {} }),
    ).rejects.toThrow('relay quorum');
  });

  it('encrypts directed SDP instead of exposing it in relay content', async () => {
    const pool = fakePool();
    const senderKey = generateSecretKey();
    const targetKey = generateSecretKey();
    const signaling = new NostrSignaling({
      relays: ['wss://one.test', 'wss://two.test', 'wss://three.test'],
      pool,
      secretKey: senderKey,
    });
    await signaling.send('AB2Z', getPublicKey(targetKey), { type: 'offer', sdp: 'private-sdp' });
    const event = pool.events[0]!;
    expect(event.content).not.toContain('private-sdp');
    const conversationKey = nip44.v2.utils.getConversationKey(targetKey, getPublicKey(senderKey));
    expect(JSON.parse(nip44.v2.decrypt(String(event.content), conversationKey))).toEqual({
      type: 'offer',
      sdp: 'private-sdp',
    });
  });

  it('pins shared-link resolution to the invited host instead of the newest announcer', async () => {
    const hostKey = generateSecretKey();
    const hostPubkey = getPublicKey(hostKey);
    const attackerKey = generateSecretKey();
    const announcement = (secretKey: Uint8Array, createdAt: number) =>
      finalizeEvent(
        {
          kind: ROOM_ANNOUNCEMENT_KIND,
          created_at: createdAt,
          tags: [
            ['d', 'AB2Z'],
            ['expiration', '2000'],
          ],
          content: JSON.stringify({ gameId: 'blitz', seats: 4, config: {} }),
        },
        secretKey,
      );
    const pool = fakePool(new Set(), [
      announcement(hostKey, 1000),
      announcement(attackerKey, 1001),
    ]);
    const signaling = new NostrSignaling({
      relays: ['wss://one.test'],
      pool,
      now: () => 1_500_000,
    });

    await expect(signaling.resolve('AB2Z', hostPubkey)).resolves.toMatchObject({ hostPubkey });
    expect(pool.queries[0]).toMatchObject({
      authors: [hostPubkey],
      '#d': ['AB2Z'],
      kinds: [ROOM_ANNOUNCEMENT_KIND],
    });
  });

  it('rejects a relay result that violates the expected-host filter', async () => {
    const hostKey = generateSecretKey();
    const attackerKey = generateSecretKey();
    const attacker = finalizeEvent(
      {
        kind: ROOM_ANNOUNCEMENT_KIND,
        created_at: 1000,
        tags: [
          ['d', 'AB2Z'],
          ['expiration', '2000'],
        ],
        content: JSON.stringify({ gameId: 'blitz', seats: 4, config: {} }),
      },
      attackerKey,
    );
    const signaling = new NostrSignaling({
      relays: ['wss://one.test'],
      pool: fakePool(new Set(), [attacker]),
      now: () => 1_500_000,
    });

    await expect(signaling.resolve('AB2Z', getPublicKey(hostKey))).rejects.toThrow(
      'different peer',
    );
  });

  it('ignores a malformed newer announcement instead of breaking valid resolution', async () => {
    const hostKey = generateSecretKey();
    const hostPubkey = getPublicKey(hostKey);
    const signed = (createdAt: number, content: string) =>
      finalizeEvent(
        {
          kind: ROOM_ANNOUNCEMENT_KIND,
          created_at: createdAt,
          tags: [
            ['d', 'AB2Z'],
            ['expiration', '2000'],
          ],
          content,
        },
        hostKey,
      );
    const signaling = new NostrSignaling({
      relays: ['wss://one.test'],
      pool: fakePool(new Set(), [
        signed(1000, JSON.stringify({ gameId: 'blitz', seats: 4, config: {} })),
        signed(1001, '{broken'),
      ]),
      now: () => 1_500_000,
    });

    await expect(signaling.resolve('AB2Z', hostPubkey)).resolves.toMatchObject({
      hostPubkey,
      settings: { gameId: 'blitz', seats: 4 },
    });
  });

  it('announces rooms as stored addressable events, not ephemeral kind 21088', async () => {
    const pool = fakePool();
    const signaling = new NostrSignaling({
      relays: ['wss://one.test', 'wss://two.test', 'wss://three.test'],
      pool,
    });
    await signaling.announce('AB2Z', { gameId: 'blitz', seats: 4, config: {} });
    expect(pool.events[0]?.kind).toBe(ROOM_ANNOUNCEMENT_KIND);
    expect(ROOM_ANNOUNCEMENT_KIND).toBeGreaterThanOrEqual(30_000);
    expect(ROOM_ANNOUNCEMENT_KIND).toBeLessThan(40_000);
  });

  it('ships a write-capable relay list and does not count a paid relay as healthy', () => {
    expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_RELAYS.some((url) => url.includes('nostr.wine'))).toBe(false);
    expect(DEFAULT_RELAYS).toContain('wss://relay.primal.net');
  });

  it('reads a comma-separated relay override', () => {
    expect(relaysFromEnv(' wss://a.example , wss://b.example ')).toEqual([
      'wss://a.example',
      'wss://b.example',
    ]);
    expect(relaysFromEnv('')).toBeUndefined();
    expect(relaysFromEnv(undefined)).toBeUndefined();
  });
});

describe('Memory signaling', () => {
  it('routes a room announcement and a directed signal between two seats', async () => {
    const bus = new InMemorySignalingBus();
    const host = new MemorySignaling('host-key', bus);
    const guest = new MemorySignaling('guest-key', bus);

    await host.announce('AB2Z', { gameId: 'blitz', seats: 2, config: {} });
    await expect(guest.resolve('AB2Z')).resolves.toMatchObject({
      hostPubkey: 'host-key',
    });

    const received: Array<{ author: string; payload: unknown }> = [];
    const sub = guest.subscribe('AB2Z', (author, payload) => received.push({ author, payload }));
    await host.send('AB2Z', 'guest-key', { type: 'offer', sdp: 'hello' });
    expect(received).toEqual([{ author: 'host-key', payload: { type: 'offer', sdp: 'hello' } }]);
    sub.close();
  });

  it('pins a share-link resolve to the invited host and refuses a squatter', async () => {
    const bus = new InMemorySignalingBus();
    const host = new MemorySignaling('host-key', bus);
    const squatter = new MemorySignaling('squatter-key', bus);
    const guest = new MemorySignaling('guest-key', bus);

    await host.announce('AB2Z', { gameId: 'blitz', seats: 2, config: {} });
    // A squatter republishes the same code after the fact.
    await squatter.announce('AB2Z', { gameId: 'blitz', seats: 2, config: {} });

    await expect(guest.resolve('AB2Z', 'host-key')).resolves.toMatchObject({
      hostPubkey: 'host-key',
    });
    await expect(guest.resolve('AB2Z', 'squatter-key')).resolves.toMatchObject({
      hostPubkey: 'squatter-key',
    });
    // Without a pin the latest announcement wins — same as the relays.
    await expect(guest.resolve('AB2Z')).resolves.toMatchObject({
      hostPubkey: 'squatter-key',
    });
  });
});
