import { generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import { NostrSignaling, type RelayPool } from './NostrSignaling';

function fakePool(
  failing = new Set<string>(),
): RelayPool & { events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    ensureRelay: async (url) => {
      if (failing.has(url)) throw new Error('offline');
    },
    publish: (relays, event) => {
      events.push(event as unknown as Record<string, unknown>);
      return relays.map((url) =>
        failing.has(url) ? Promise.reject(new Error('offline')) : Promise.resolve('ok'),
      );
    },
    querySync: async () => [],
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
});
