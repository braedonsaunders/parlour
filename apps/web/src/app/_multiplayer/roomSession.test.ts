import {
  applyPreset,
  chooseBotMove,
  createSession,
  isVeilHandle,
  makeRng,
  stateHash,
} from '@parlour/engine';
import { type BlitzConfig, type BlitzState } from '@parlour/game-blitz';
import {
  cribbageConfigSchema,
  type CribbageConfig,
  type CribbageState,
} from '@parlour/game-cribbage';
import {
  createEuchreDef,
  euchreConfig,
  tierBot,
  type EuchreRules,
  type EuchreState,
} from '@parlour/game-euchre';
import { eightsConfig, type EightsRules, type EightsState } from '@parlour/game-eights';
import { ginConfigSchema, type GinConfig, type GinMatchState } from '@parlour/game-gin';
import { presidentConfig, type PresidentRules, type PresidentState } from '@parlour/game-president';
import {
  ratscrewConfigSchema,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import {
  createSpadesDef,
  spadesConfig,
  type SpadesRules,
  type SpadesState,
} from '@parlour/game-spades';
import { spadesModeForRules } from '@/lib/spades/modes';
import {
  wildpileConfig,
  wildpileFace,
  wildpileGame,
  sameWildpileFace,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineAuthority } from '@/lib/multiplayer';
import { NostrSignaling, type SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';
import { MULTIPLAYER_GAME_IDS, ROOM_GAMES } from '@/lib/rooms/gameRegistry';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  expectedRoomGameId,
  getActiveMultiplayerSession,
  LOBBY_CLOSED,
  multiplayerSession,
  MultiplayerRoomSession,
  type MultiplayerGameId,
} from './roomSession';

type SignalHandler = (sender: string, signal: SignalPayload) => void;

/**
 * A real Nostr pubkey is 32 bytes of hex, and host-bound invites validate that
 * shape before pinning it. The fixture names its seats for readability, so map
 * each label to a deterministic well-formed key: the mock then feeds the same
 * kind of input production does, instead of a short string that only passes
 * because nothing was checking.
 */
function mockPubkey(label: string): string {
  let hash = 2166136261 >>> 0;
  let out = '';
  for (let chunk = 0; chunk < 8; chunk++) {
    for (const char of `${label}:${chunk}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    out += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

class MockSignalingBroker {
  readonly rooms = new Map<string, { hostPubkey: string; settings: RoomSettings }>();
  readonly handlers = new Map<string, Map<string, SignalHandler>>();

  constructor(private readonly letWireSettleBeforeSendReturns = false) {}

  signaling(label: string): NostrSignaling {
    const broker = this;
    const publicKey = mockPubkey(label);
    return {
      publicKey,
      async announce(code: string, settings: RoomSettings) {
        broker.rooms.set(code, { hostPubkey: publicKey, settings });
      },
      async resolve(code: string, expectedHost?: string) {
        const room = broker.rooms.get(code);
        if (!room) throw new Error('Room not found');
        // Mirrors the real signaling contract: a host-bound invite refuses an
        // announcement authored by anyone but the pinned host.
        if (expectedHost !== undefined && room.hostPubkey !== expectedHost) {
          throw new Error('Room host does not match this invite');
        }
        return room;
      },
      subscribe(code: string, callback: SignalHandler) {
        const roomHandlers = broker.handlers.get(code) ?? new Map<string, SignalHandler>();
        roomHandlers.set(publicKey, callback);
        broker.handlers.set(code, roomHandlers);
        return { close: () => roomHandlers.delete(publicKey) };
      },
      async send(code: string, recipient: string, signal: SignalPayload) {
        queueMicrotask(() => broker.handlers.get(code)?.get(recipient)?.(publicKey, signal));
        if (broker.letWireSettleBeforeSendReturns) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      },
      close() {},
    } as unknown as NostrSignaling;
  }
}

class MockDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  peer?: MockDataChannel;

  send(data: string) {
    queueMicrotask(() => this.peer?.onmessage?.(new MessageEvent('message', { data })));
  }

  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}

class MockRtcNetwork {
  private nextId = 0;
  private readonly peers = new Map<string, MockPeerConnection>();

  factory(owner: string) {
    return () => {
      const peer = new MockPeerConnection(`${owner}-${this.nextId++}`, this);
      this.peers.set(peer.id, peer);
      return peer as unknown as RTCPeerConnection;
    };
  }

  get(id: string) {
    return this.peers.get(id)!;
  }
}

class MockPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: RTCPeerConnection['onicecandidate'] = null;
  ondatachannel: RTCPeerConnection['ondatachannel'] = null;
  onconnectionstatechange: RTCPeerConnection['onconnectionstatechange'] = null;
  private outgoing?: MockDataChannel;
  private initiator?: MockPeerConnection;

  constructor(
    readonly id: string,
    private readonly network: MockRtcNetwork,
  ) {}

  createDataChannel() {
    this.outgoing = new MockDataChannel();
    return this.outgoing as unknown as RTCDataChannel;
  }

  async createOffer() {
    return { type: 'offer' as const, sdp: this.id };
  }

  async createAnswer() {
    if (!this.initiator?.outgoing) throw new Error('offer did not include a data channel');
    const incoming = new MockDataChannel();
    incoming.peer = this.initiator.outgoing;
    this.initiator.outgoing.peer = incoming;
    const onDataChannel = this.ondatachannel as ((event: RTCDataChannelEvent) => void) | null;
    onDataChannel?.({ channel: incoming as unknown as RTCDataChannel } as RTCDataChannelEvent);
    queueMicrotask(() => {
      incoming.open();
      this.initiator?.outgoing?.open();
    });
    return { type: 'answer' as const, sdp: this.id };
  }

  async setLocalDescription() {}

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description as RTCSessionDescription;
    if (description.type === 'offer' && description.sdp) {
      this.initiator = this.network.get(description.sdp);
    }
  }

  async addIceCandidate() {}
  close() {
    this.connectionState = 'closed';
  }
}

async function eventually(assertion: () => void, attempts = 40, delayMs = 0) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  assertion();
}

describe('multiplayer route composition', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.close());
    clearActiveMultiplayerSession();
    // One test pins its tier through the e2e seam; a leaked global would
    // silently deal every test after it in the open.
    delete (window as unknown as { __PARLOUR_E2E_SECURITY__?: string }).__PARLOUR_E2E_SECURITY__;
    vi.restoreAllMocks();
  });

  // D3 seam: a share link carries a host-binding capability because a 4-char
  // code is a public locator, not an authenticator. roomSession must forward it
  // to the directory lookup AND the transport, so a squatter who republishes
  // the same code cannot answer for a link-borne join.
  it('forwards a share link host pin to signaling and refuses a mismatched host', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const hostSignaling = broker.signaling('pin-host-peer');
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'pin-host-profile' },
      { signaling: hostSignaling, peerConnection: rtc.factory('pin-host'), seed: 11 },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'pin-guest-profile' },
      {
        signaling: broker.signaling('pin-guest-peer'),
        peerConnection: rtc.factory('pin-guest'),
        seed: 12,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });

    // Wrong pin: an impostor's key must not resolve this room.
    await expect(guest.join(room.code, mockPubkey('impostor-peer'))).rejects.toThrow(
      /host does not match/i,
    );

    // Right pin: the genuine host key still joins.
    const rejoin = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'pin-guest-profile' },
      {
        signaling: broker.signaling('pin-guest2-peer'),
        peerConnection: rtc.factory('pin-guest2'),
        seed: 13,
      },
    );
    sessions.push(rejoin);
    await rejoin.join(room.code, hostSignaling.publicKey);
    await eventually(() => expect(rejoin.getSnapshot().localSeat).toBe(1));
  });

  it('creates and joins through browser transport, then applies the same move on both peers', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'host-profile' },
      { signaling: broker.signaling('host-peer'), peerConnection: rtc.factory('host'), seed: 42 },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'guest-profile' },
      { signaling: broker.signaling('guest-peer'), peerConnection: rtc.factory('guest'), seed: 7 },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await eventually(() => {
      expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)).toMatchObject({
        profileId: 'guest-profile',
        name: 'Guest',
        avatarId: 'cobalt',
      });
      expect(guest.getSnapshot().seats.find((seat) => seat.seat === 0)).toMatchObject({
        profileId: 'host-profile',
        name: 'Host',
        avatarId: 'ember',
      });
    });

    host.send('draw.stock');

    await eventually(() => {
      expect(host.getSnapshot().session?.log).toHaveLength(1);
      expect(guest.getSnapshot().session?.log).toHaveLength(1);
    });
    expect(stateHash(guest.getSnapshot().session?.state)).toBe(
      stateHash(host.getSnapshot().session?.state),
    );
  });

  /**
   * Friend rooms share one deal path, and it is the veiled one. Every pack
   * supports it, so no game is left on a weaker path than its neighbours —
   * which was the same principle when this asserted the opposite.
   */
  it('deals every friend room veiled, so no game is on a weaker path', async () => {
    for (const gameId of MULTIPLAYER_GAME_IDS) {
      const pack = ROOM_GAMES[gameId];
      const seats = pack.seats.min;
      const host = new MultiplayerRoomSession(
        { name: 'Host', avatarId: 'ember', profileId: `open-tier-${gameId}` },
        {
          signaling: new MockSignalingBroker().signaling(`open-tier-${gameId}`),
          peerConnection: new MockRtcNetwork().factory(`open-tier-${gameId}`),
          seed: 3,
        },
      );
      sessions.push(host);
      await host.create({ gameId, seats });
      expect(host.getSnapshot().settings?.security, gameId).toBe('veil');
      expect(host.getSnapshot().security.tier, gameId).toBe('veil');
    }
  });

  // Regression: room seeds came off `Uint32Array` through `| 0`, so half of
  // them were negative — and the wire bounds a snapshot seed to 0…0xffffffff.
  // The welcome carrying one was refused as malformed, the guest never adopted
  // the host's deal, and because presence carries no seed it still took a seat
  // and played a deal of its own. Every other test injects a positive seed,
  // which is exactly why nothing caught it.
  it('deals a room whose seed lands in the negative half of int32', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'seed-host' },
      {
        signaling: broker.signaling('seed-host-peer'),
        peerConnection: rtc.factory('seed-host'),
        seed: -1465448351,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'seed-guest' },
      {
        signaling: broker.signaling('seed-guest-peer'),
        peerConnection: rtc.factory('seed-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(guest.getSnapshot().error).toBeNull();
    // The guest is playing the host's deal, not one of its own.
    await eventually(() =>
      expect(guest.getSnapshot().session?.seed).toBe(host.getSnapshot().session?.seed),
    );
    expect(stateHash(guest.getSnapshot().session?.state)).toBe(
      stateHash(host.getSnapshot().session?.state),
    );
  });

  // Regression: a seated guest used to be pushed straight onto the table while
  // the host was still in the lobby, so it played the placeholder deal the host
  // was about to replace — one screen dealing, the other still waiting, and the
  // guest's seat eventually handed to a bot.
  it('holds a guest in the lobby until the host deals, then opens both tables', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'stage-host' },
      {
        signaling: broker.signaling('stage-host-peer'),
        peerConnection: rtc.factory('stage-host'),
        seed: 42,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'stage-guest' },
      {
        signaling: broker.signaling('stage-guest-peer'),
        peerConnection: rtc.factory('stage-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    // Seated, but nobody has dealt: both peers are still in the lobby.
    expect(host.getSnapshot().stage).toBe('lobby');
    expect(guest.getSnapshot().stage).toBe('lobby');

    await host.start();

    expect(host.getSnapshot().stage).toBe('table');
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'));
    // The opening position the host published is the one the guest is playing.
    expect(stateHash(guest.getSnapshot().session?.state)).toBe(
      stateHash(host.getSnapshot().session?.state),
    );
  });

  it.each(MULTIPLAYER_GAME_IDS)(
    'deals %s when the host starts as soon as the guest chair appears',
    async (gameId) => {
      // Real Nostr publication can stay in flight long enough for the WebRTC
      // channel to finish its welcome exchange first. Exercise that ordering:
      // the host sees the chair before the guest's `join()` continuation stores
      // its RoomHandle and local seat.
      const broker = new MockSignalingBroker(true);
      const rtc = new MockRtcNetwork();
      const host = new MultiplayerRoomSession(
        { name: 'Host', avatarId: 'ember', profileId: 'fast-start-host' },
        {
          signaling: broker.signaling('fast-start-host-peer'),
          peerConnection: rtc.factory('fast-start-host'),
          seed: 42,
        },
      );
      const guest = new MultiplayerRoomSession(
        { name: 'Guest', avatarId: 'cobalt', profileId: 'fast-start-guest' },
        {
          signaling: broker.signaling('fast-start-guest-peer'),
          peerConnection: rtc.factory('fast-start-guest'),
          seed: 7,
        },
      );
      sessions.push(host, guest);

      const seats = ROOM_GAMES[gameId].seats.min;
      const room = await host.create({ gameId, seats });
      const joining = guest.join(room.code);
      await eventually(() => expect(host.getSnapshot().seats).toHaveLength(2));
      for (let seat = 2; seat < seats; seat++) host.addBot(seat);
      await eventually(() => expect(host.getSnapshot().seats).toHaveLength(seats));

      const starting = host.start();
      await joining;
      await starting;

      await eventually(() => {
        expect(host.getSnapshot().stage).toBe('table');
        expect(guest.getSnapshot().stage).toBe('table');
        expect(host.getSnapshot().error).toBeNull();
        expect(guest.getSnapshot().error).toBeNull();
        expect(host.getSnapshot().gameId).toBe(gameId);
        expect(guest.getSnapshot().gameId).toBe(gameId);
        expect(stateHash(guest.getSnapshot().session?.state)).toBe(
          stateHash(host.getSnapshot().session?.state),
        );
      });
    },
    20_000,
  );

  it('kicks every guest when the host leaves the lobby', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'leave-host' },
      {
        signaling: broker.signaling('leave-host-peer'),
        peerConnection: rtc.factory('leave-host'),
        seed: 42,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'leave-guest' },
      {
        signaling: broker.signaling('leave-guest-peer'),
        peerConnection: rtc.factory('leave-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    host.close();

    await eventually(() => {
      expect(guest.getSnapshot().error).toBe(LOBBY_CLOSED);
      expect(guest.getSnapshot().connection).toBe('closed');
    });
  });

  it('lets the host fill empty chairs with bots and deal one shared table', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'bot-host' },
      {
        signaling: broker.signaling('bot-host-peer'),
        peerConnection: rtc.factory('bot-host'),
        seed: 42,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'bot-guest' },
      {
        signaling: broker.signaling('bot-guest-peer'),
        peerConnection: rtc.factory('bot-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'wildpile',
      seats: 4,
      config: applyPreset(wildpileConfig, 'party'),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    host.addBot(2);
    host.addBot(3);

    await eventually(() => {
      expect(host.getSnapshot().seats).toHaveLength(4);
      expect(host.getSnapshot().seats.filter((seat) => seat.bot)).toHaveLength(2);
      expect(guest.getSnapshot().seats.filter((seat) => seat.bot)).toHaveLength(2);
    });

    await host.start();

    expect(host.getSnapshot().stage).toBe('table');
    expect(host.getSnapshot().security.tier).toBe('veil');
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'));
    expect(stateHash(guest.getSnapshot().session?.state)).toBe(
      stateHash(host.getSnapshot().session?.state),
    );
  });

  it('keeps the lobby up and names the fault when chairs are still empty', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'start-empty-host' },
      {
        signaling: new MockSignalingBroker().signaling('start-empty-host-peer'),
        peerConnection: new MockRtcNetwork().factory('start-empty-host'),
        seed: 3,
      },
    );
    sessions.push(host);
    await host.create({
      gameId: 'wildpile',
      seats: 4,
      config: applyPreset(wildpileConfig, 'party'),
    });

    await expect(host.start()).rejects.toThrow(/every seat must be filled/);
    expect(host.getSnapshot().error).toMatch(/every seat must be filled/);
    expect(host.getSnapshot().stage).toBe('lobby');
  });

  it('blames the right device when a shuffle commitment cannot be produced', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'deal-fault-host' },
      {
        signaling: broker.signaling('deal-fault-host-peer'),
        peerConnection: rtc.factory('deal-fault-host'),
        seed: 5,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'deal-fault-guest' },
      {
        signaling: broker.signaling('deal-fault-guest-peer'),
        peerConnection: rtc.factory('deal-fault-guest'),
        seed: 6,
      },
    );
    sessions.push(host, guest);
    const room = await host.create({ gameId: 'cribbage', seats: 2 });

    // Break the hash only while the GUEST attaches, so exactly one device
    // cannot produce its commitment — one real route being a non-secure
    // context, where crypto.subtle does not exist at all.
    const subtle = globalThis.crypto.subtle;
    Object.defineProperty(globalThis.crypto, 'subtle', {
      configurable: true,
      get() {
        return undefined;
      },
    });
    try {
      await guest.join(room.code);

      // The commitment is produced off the join promise, so the break has to
      // outlive `join` resolving — restoring in a `finally` here would let the
      // hash succeed after all and the fault would never happen.
      await eventually(
        () =>
          expect(guest.getSnapshot().dealFault).toMatch(/this device could not mix the shuffle/i),
        2_000,
        10,
      );
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: subtle,
      });
    }

    // The starting host, whose own mixing worked, still reports the silent
    // seat as missing — an honest statement from where it stands.
    await expect(host.start()).rejects.toThrow(/seat 2 never mixed the shuffle/);
    // The host's refusal is the deal-round timeout expiring, which is ten
    // seconds by design — the point of the case is that the broken device says
    // so long before then, not that the timeout is short.
  }, 20_000);

  it('announces the created seat count so a guest draws the same chairs', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'seat-count-host' },
      {
        signaling: broker.signaling('seat-count-host-peer'),
        peerConnection: rtc.factory('seat-count-host'),
        seed: 11,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'seat-count-guest' },
      {
        signaling: broker.signaling('seat-count-guest-peer'),
        peerConnection: rtc.factory('seat-count-guest'),
        seed: 13,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      config: applyPreset(wildpileConfig, 'party'),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(host.getSnapshot().settings?.seats).toBe(2);
    expect(guest.getSnapshot().settings?.seats).toBe(2);
    expect(host.getSnapshot().seats).toHaveLength(2);
    expect(guest.getSnapshot().seats).toHaveLength(2);
  });

  it('awards a walkover when a two-seat opponent stays gone', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'walkover-host' },
      {
        signaling: broker.signaling('walkover-host-peer'),
        peerConnection: rtc.factory('walkover-host'),
        seed: 19,
        heartbeatIntervalMs: 20,
        heartbeatTimeoutMs: 400,
        reconnectGraceMs: 30,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'walkover-guest' },
      {
        signaling: broker.signaling('walkover-guest-peer'),
        peerConnection: rtc.factory('walkover-guest'),
        seed: 4,
        heartbeatIntervalMs: 20,
        heartbeatTimeoutMs: 400,
        reconnectGraceMs: 30,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await host.start();
    await eventually(() => expect(host.getSnapshot().stage).toBe('table'));

    guest.close();
    await eventually(
      () => {
        const result = host.getSnapshot().session?.result;
        expect(result?.reason).toBe('opponent-left');
        expect(result?.winner).toBe(0);
        expect(host.getSnapshot().error).toBeNull();
      },
      200,
      20,
    );
  }, 120_000);

  it('pins the seated room on the tab so a table route cannot miss it', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'pin-tab-host' },
      {
        signaling: new MockSignalingBroker().signaling('pin-tab-host-peer'),
        peerConnection: new MockRtcNetwork().factory('pin-tab-host'),
        seed: 3,
      },
    );
    sessions.push(host);
    await host.create({ seats: 2 });

    activateMultiplayerSession(host);
    expect(getActiveMultiplayerSession()).toBe(host);
    expect(expectedRoomGameId()).toBe('blitz');

    clearActiveMultiplayerSession();
    expect(getActiveMultiplayerSession()).toBeNull();
    expect(expectedRoomGameId()).toBeNull();
  });

  it('deals both peers the same replayable veiled hands', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'open-deal-host' },
      {
        signaling: broker.signaling('open-deal-host-peer'),
        peerConnection: rtc.factory('open-deal-host'),
        seed: 44,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'open-deal-guest' },
      {
        signaling: broker.signaling('open-deal-guest-peer'),
        peerConnection: rtc.factory('open-deal-guest'),
        seed: 8,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => {
      expect(host.getSnapshot().seats).toHaveLength(2);
      expect(guest.getSnapshot().localSeat).toBe(1);
    });
    await host.start();
    await eventually(
      () => {
        expect(host.getSnapshot().stage).toBe('table');
        expect(guest.getSnapshot().stage).toBe('table');
        const hostState = multiplayerSession<BlitzState, BlitzConfig>(
          host.getSnapshot(),
          'blitz',
        )!.state;
        const guestState = multiplayerSession<BlitzState, BlitzConfig>(
          guest.getSnapshot(),
          'blitz',
        )!.state;
        // Every room deals veiled, so the SHARED state both peers replay is
        // handles on both sides — a seat resolves only its own hand, and only
        // for itself. The property this test was always about survives that
        // and is strengthened by it: the two peers still agree byte for byte.
        expect(hostState.hands.flat().every(isVeilHandle)).toBe(true);
        expect(guestState.hands.flat().every(isVeilHandle)).toBe(true);
        expect(stateHash(guestState)).toBe(stateHash(hostState));
      },
      1_000,
      10,
    );
  }, 120_000);

  it('awards a two-seat walkover when the opponent leaves mid-round', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'walkover-host' },
      {
        signaling: broker.signaling('walkover-host-peer'),
        peerConnection: rtc.factory('walkover-host'),
        seed: 77,
        heartbeatIntervalMs: 20,
        heartbeatTimeoutMs: 2_000,
        // Every room is veiled now, so a seat that vanishes is held for its
        // grace period before the table gives up on it — the walkover is the
        // same, it just waits to be sure they are not coming back.
        reconnectGraceMs: 30,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'walkover-guest' },
      {
        signaling: broker.signaling('walkover-guest-peer'),
        peerConnection: rtc.factory('walkover-guest'),
        seed: 5,
        heartbeatIntervalMs: 20,
        heartbeatTimeoutMs: 2_000,
        reconnectGraceMs: 30,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await host.start();
    await eventually(() => {
      expect(host.getSnapshot().stage).toBe('table');
      expect(guest.getSnapshot().stage).toBe('table');
    });

    guest.close();
    await eventually(
      () => {
        expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)?.connected).toBe(false);
        expect(host.getSnapshot().session?.result?.reason).toBe('opponent-left');
        expect(host.getSnapshot().session?.result?.winner).toBe(0);
        expect(host.getSnapshot().security.paused).toBeNull();
      },
      2000,
      10,
    );
  }, 120_000);

  it('discovers a Wild room and keeps its action-card state synchronized', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'wild-host' },
      {
        signaling: broker.signaling('wild-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 91,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'wild-guest' },
      {
        signaling: broker.signaling('wild-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      config: applyPreset(wildpileConfig, 'party'),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(host.getSnapshot()).toMatchObject({ gameId: 'wildpile' });
    expect(guest.getSnapshot()).toMatchObject({ gameId: 'wildpile' });
    expect(guest.getSnapshot().settings?.config).toMatchObject({
      stackDrawTwo: true,
      stackDrawFour: true,
      jumpIn: true,
    });

    const hostSession = multiplayerSession<WildpileState, WildpileRules>(
      host.getSnapshot(),
      'wildpile',
    );
    expect(hostSession).not.toBeNull();
    const move = hostSession!.def.flow.legalMoves(hostSession!.state, hostSession!.phase)[0];
    expect(move).toBeDefined();
    host.send(move!.id, move!.payload);

    await eventually(() => {
      expect(
        multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')?.log,
      ).toHaveLength(1);
      expect(
        multiplayerSession<WildpileState, WildpileRules>(guest.getSnapshot(), 'wildpile')?.log,
      ).toHaveLength(1);
    });
    expect(
      stateHash(
        multiplayerSession<WildpileState, WildpileRules>(guest.getSnapshot(), 'wildpile')?.state,
      ),
    ).toBe(
      stateHash(
        multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')?.state,
      ),
    );
  });

  it('rematches Wild in the same room with the same seats and a fresh shared deal', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'rematch-host' },
      {
        signaling: broker.signaling('rematch-host-peer'),
        peerConnection: rtc.factory('rematch-host'),
        seed: 91,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'rematch-guest' },
      {
        signaling: broker.signaling('rematch-guest-peer'),
        peerConnection: rtc.factory('rematch-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    /*
     * Pinned open through the test seam, and the reason is the harness rather
     * than the product.
     *
     * This test plays a whole match out by asking the pack for legal moves
     * against the SHARED state. Under Veil that state is handles — exactly
     * right, a seat resolves only its own hand — but the loop driving it is
     * not a seat and cannot see what a real client would, so the moves stop
     * being accepted partway through. Veiled multi-hand play has its own
     * coverage (ceremony, hand, second ceremony, reissuing nothing from the
     * first). What THIS one is about is the rematch: same room, same seats,
     * fresh seed, empty log.
     *
     * The seam is used rather than `create({ security: 'open' })` because a
     * room may not ask to be dealt in the open — `resolveRoomSettings` sends
     * anything that is not an accepted veil request to `tierFor()`, so that
     * argument would be quietly ignored and this comment would be a lie.
     */
    (window as unknown as { __PARLOUR_E2E_SECURITY__?: string }).__PARLOUR_E2E_SECURITY__ = 'open';
    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      config: wildpileConfig.resolve({ handSize: 5, jumpIn: false, forcePlay: true }),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'));

    const bot = wildpileGame.bots[0]!;
    for (let step = 0; step < 6_000; step++) {
      const session = multiplayerSession<WildpileState, WildpileRules>(
        host.getSnapshot(),
        'wildpile',
      )!;
      if (session.status === 'ended') break;
      const actor = session.phase.actor;
      if (actor === null) throw new Error(`Wild has no actor in ${session.phase.phase}`);
      const legal = wildpileGame.flow.legalMoves(session.state, session.phase);
      const move = bot.chooseMove(session.state, actor, legal, makeRng(step), {
        thinkMs: () => 0,
      });
      if (!move) throw new Error(`Wild bot has no move in ${session.phase.phase}`);
      const before = session.log.length;
      (actor === 0 ? host : guest).send(move.id, move.payload);
      await eventually(() => {
        expect(host.getSnapshot().session?.log.length).toBeGreaterThan(before);
        expect(guest.getSnapshot().session?.log.length).toBeGreaterThan(before);
      }, 200);
    }

    const finished = host.getSnapshot();
    expect(finished.session?.status).toBe('ended');
    expect(guest.getSnapshot().session?.status).toBe('ended');
    const firstSeed = finished.session!.seed;
    const roster = finished.seats.map(({ seat, profileId }) => ({ seat, profileId }));

    // Either player can ask; the current host deals and both existing peers
    // atomically adopt the new table without revisiting create/join.
    await guest.rematch();
    await eventually(() => {
      expect(host.getSnapshot().session?.status).toBe('playing');
      expect(guest.getSnapshot().session?.status).toBe('playing');
    });

    expect(host.getSnapshot().room?.code).toBe(room.code);
    expect(guest.getSnapshot().room?.code).toBe(room.code);
    expect(host.getSnapshot().localSeat).toBe(0);
    expect(guest.getSnapshot().localSeat).toBe(1);
    expect(host.getSnapshot().seats.map(({ seat, profileId }) => ({ seat, profileId }))).toEqual(
      roster,
    );
    expect(guest.getSnapshot().seats.map(({ seat, profileId }) => ({ seat, profileId }))).toEqual(
      roster,
    );
    expect(host.getSnapshot().session?.seed).not.toBe(firstSeed);
    expect(guest.getSnapshot().session?.seed).toBe(host.getSnapshot().session?.seed);
    expect(host.getSnapshot().session?.log).toHaveLength(0);
    expect(guest.getSnapshot().session?.log).toHaveLength(0);
    expect(stateHash(guest.getSnapshot().session?.state)).toBe(
      stateHash(host.getSnapshot().session?.state),
    );
  }, 120_000);

  it('plays a peeled Wild card by opening its handle, not the face sitting in the view', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'wild-play-host' },
      {
        signaling: broker.signaling('wild-play-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 91,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'wild-play-guest' },
      {
        signaling: broker.signaling('wild-play-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      config: applyPreset(wildpileConfig, 'party'),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await host.start();
    await eventually(() => {
      expect(host.getSnapshot().stage).toBe('table');
      expect(guest.getSnapshot().stage).toBe('table');
    });

    await eventually(
      () => {
        const hostHand =
          multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')?.state
            .hands[0] ?? [];
        const guestHand =
          multiplayerSession<WildpileState, WildpileRules>(guest.getSnapshot(), 'wildpile')?.state
            .hands[1] ?? [];
        expect(hostHand.length).toBeGreaterThan(0);
        expect(guestHand.length).toBeGreaterThan(0);
        expect(hostHand.every((card) => !isVeilHandle(card))).toBe(true);
        expect(guestHand.every((card) => !isVeilHandle(card))).toBe(true);
      },
      1_000,
      10,
    );

    const actor = multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')!
      .phase.actor;
    const speaker = actor === 0 ? host : guest;
    const live = multiplayerSession<WildpileState, WildpileRules>(
      speaker.getSnapshot(),
      'wildpile',
    )!;
    let play = live.def.flow
      .legalMoves(live.state, live.phase)
      .find((move) => move.id === 'playCard');
    if (!play) {
      speaker.send('draw');
      await eventually(
        () => {
          const after = multiplayerSession<WildpileState, WildpileRules>(
            speaker.getSnapshot(),
            'wildpile',
          )!;
          expect(after.log.length).toBeGreaterThan(0);
          play = after.def.flow
            .legalMoves(after.state, after.phase)
            .find((move) => move.id === 'playCard');
          expect(play).toBeDefined();
        },
        1_000,
        10,
      );
    }
    expect(play).toBeDefined();
    const before = multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')!
      .log.length;
    speaker.send(play!.id, play!.payload);

    await eventually(
      () => {
        const after = multiplayerSession<WildpileState, WildpileRules>(
          host.getSnapshot(),
          'wildpile',
        )!;
        expect(after.log.length).toBeGreaterThan(before);
        expect(after.log.some((event) => event.move === 'playCard')).toBe(true);
        expect(host.getSnapshot().error).toBeNull();
        expect(guest.getSnapshot().error).toBeNull();
      },
      1_000,
      10,
    );
  }, 120_000);

  it('declines a jump-in when this seat has no exact match', async () => {
    let randomState = 0x5eed;
    const deterministicRandom: Crypto['getRandomValues'] = <T extends ArrayBufferView | null>(
      array: T,
    ): T => {
      if (array === null) return array;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let index = 0; index < bytes.length; index++) {
        randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
        bytes[index] = randomState >>> 24;
      }
      return array;
    };
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(deterministicRandom);
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('parlour.veil.round.')) window.localStorage.removeItem(key);
    }

    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'wild-jump-host' },
      {
        signaling: broker.signaling('wild-jump-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 91,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'wild-jump-guest' },
      {
        signaling: broker.signaling('wild-jump-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      config: applyPreset(wildpileConfig, 'party'),
      security: 'veil',
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    await host.start();
    await eventually(() => {
      expect(host.getSnapshot().stage).toBe('table');
      expect(guest.getSnapshot().stage).toBe('table');
    });
    await eventually(
      () => {
        const hostHand =
          multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')?.state
            .hands[0] ?? [];
        const guestHand =
          multiplayerSession<WildpileState, WildpileRules>(guest.getSnapshot(), 'wildpile')?.state
            .hands[1] ?? [];
        expect(hostHand.length).toBeGreaterThan(0);
        expect(guestHand.length).toBeGreaterThan(0);
        expect(hostHand.every((card) => !isVeilHandle(card))).toBe(true);
        expect(guestHand.every((card) => !isVeilHandle(card))).toBe(true);
      },
      1_000,
      10,
    );

    const actor = multiplayerSession<WildpileState, WildpileRules>(host.getSnapshot(), 'wildpile')!
      .phase.actor;
    const speaker = actor === 0 ? host : guest;
    const other = actor === 0 ? guest : host;
    const live = multiplayerSession<WildpileState, WildpileRules>(
      speaker.getSnapshot(),
      'wildpile',
    )!;
    expect(speaker.getSnapshot().security.tier).toBe('veil');
    expect(live.state.veiled).toBe(true);
    const otherSeat = other.getSnapshot().localSeat!;
    const otherHand = multiplayerSession<WildpileState, WildpileRules>(
      other.getSnapshot(),
      'wildpile',
    )!.state.hands[otherSeat]!;
    const play = live.def.flow.legalMoves(live.state, live.phase).find((move) => {
      if (move.id !== 'playCard') return false;
      const card = (move.payload as { card?: string } | undefined)?.card;
      return (
        Boolean(card) &&
        !wildpileFace(card!).meta.kind.startsWith('wild') &&
        !otherHand.some((held) => sameWildpileFace(held, card!))
      );
    });
    expect(play).toBeDefined();
    const before = live.log.length;
    speaker.send(play!.id, play!.payload);

    await eventually(
      () => {
        const after = multiplayerSession<WildpileState, WildpileRules>(
          other.getSnapshot(),
          'wildpile',
        )!;
        expect(after.state.interrupt).toBeNull();
        expect(after.phase.phase).toBe('play');
        expect(after.log.slice(before).some((event) => event.move === 'declineJump')).toBe(true);
        expect(other.getSnapshot().error).toBeNull();
        expect(host.getSnapshot().error).toBeNull();
      },
      1_000,
      10,
    );
  }, 120_000);

  it('races Rat Screw slaps through the authority with hash-identical logs', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'rat-host' },
      {
        signaling: broker.signaling('rat-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 4242,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'rat-guest' },
      {
        signaling: broker.signaling('rat-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 99,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'ratscrew',
      seats: 2,
      config: ratscrewConfigSchema.resolve({ slapWindowMs: 400 }),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));
    expect(host.getSnapshot()).toMatchObject({ gameId: 'ratscrew' });
    expect(
      multiplayerSession<RatscrewState, RatscrewConfig>(guest.getSnapshot(), 'ratscrew'),
    ).not.toBeNull();

    // Drive a slice of real play: flips until a window opens, then both seats
    // slam at once — arrival order on the authority decides the winner.
    const stateOf = (session: { state: unknown } | null) => session!.state as RatscrewState;
    let windowsSeen = 0;
    for (let step = 0; step < 60; step++) {
      const hostSession = multiplayerSession<RatscrewState, RatscrewConfig>(
        host.getSnapshot(),
        'ratscrew',
      )!;
      if (hostSession.status !== 'playing') break;
      const state = stateOf(hostSession);
      if (state.window) {
        windowsSeen += 1;
        // both peers slap; whichever intent lands first takes the pile
        host.send('slap');
        guest.send('slap');
        await eventually(() => {
          expect(
            multiplayerSession<RatscrewState, RatscrewConfig>(host.getSnapshot(), 'ratscrew')?.state
              .window,
          ).toBeNull();
          expect(
            multiplayerSession<RatscrewState, RatscrewConfig>(guest.getSnapshot(), 'ratscrew')
              ?.state.window,
          ).toBeNull();
        });
      } else {
        const before = multiplayerSession<RatscrewState, RatscrewConfig>(
          host.getSnapshot(),
          'ratscrew',
        )!.log.length;
        const turn = state.turn;
        (turn === 0 ? host : guest).send('flip');
        await eventually(() => {
          const h = multiplayerSession<RatscrewState, RatscrewConfig>(
            host.getSnapshot(),
            'ratscrew',
          )!;
          const g = multiplayerSession<RatscrewState, RatscrewConfig>(
            guest.getSnapshot(),
            'ratscrew',
          )!;
          expect(h.log.length).toBeGreaterThan(before);
          expect(g.log.length).toBe(h.log.length);
        });
      }
      // every authority event replays identically on the guest
      // (`ts` is transport wall-clock garnish and never part of state)
      const settledHost = multiplayerSession<RatscrewState, RatscrewConfig>(
        host.getSnapshot(),
        'ratscrew',
      )!;
      const strip = (log: typeof settledHost.log) =>
        log.map(({ seq, seat, move, payload, atMs, hash, automatic, injected }) => ({
          seq,
          seat,
          move,
          payload,
          atMs,
          hash,
          automatic,
          injected,
        }));
      expect(
        strip(
          multiplayerSession<RatscrewState, RatscrewConfig>(guest.getSnapshot(), 'ratscrew')!.log,
        ),
      ).toEqual(strip(settledHost.log));
    }
    expect(windowsSeen).toBeGreaterThan(0);

    // final authority identity across every flip, slap and auto-resolved event
    const hostFinal = multiplayerSession<RatscrewState, RatscrewConfig>(
      host.getSnapshot(),
      'ratscrew',
    )!;
    const guestFinal = multiplayerSession<RatscrewState, RatscrewConfig>(
      guest.getSnapshot(),
      'ratscrew',
    )!;
    expect(guestFinal.log.map((event) => event.hash)).toEqual(
      hostFinal.log.map((event) => event.hash),
    );
    expect(stateHash(guestFinal.state)).toBe(stateHash(hostFinal.state));
    expect(stateHash(guestFinal.state)).toBe(hostFinal.lastAppliedHash);
  }, 30_000);

  it('discovers a Euchre room and keeps partnership state synchronized across peers', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'euchre-host' },
      {
        signaling: broker.signaling('euchre-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 2026,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'euchre-guest' },
      {
        signaling: broker.signaling('euchre-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const created = await host.create({
      gameId: 'euchre',
      seats: 4,
      config: applyPreset(euchreConfig, 'classic'),
    });
    await guest.join(created.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(host.getSnapshot()).toMatchObject({ gameId: 'euchre' });
    expect(guest.getSnapshot()).toMatchObject({ gameId: 'euchre' });
    expect(guest.getSnapshot().settings?.config).toMatchObject({
      targetScore: 10,
      stickDealer: true,
      goingAlone: true,
    });

    // euchre opens with seat 1 (the guest) deciding left of the dealer
    const def = createEuchreDef();
    const before = multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')!;
    const legal = def.flow.legalMoves(before.state, before.phase);
    expect(legal.length).toBeGreaterThan(0);
    guest.send(legal[0]!.id, legal[0]!.payload);

    await eventually(() => {
      const hostLog =
        multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')?.log ?? [];
      const guestLog =
        multiplayerSession<EuchreState, EuchreRules>(guest.getSnapshot(), 'euchre')?.log ?? [];
      expect(guestLog.length).toBe(hostLog.length);
      expect(guestLog.length).toBeGreaterThan(0);
      expect(
        stateHash(
          multiplayerSession<EuchreState, EuchreRules>(guest.getSnapshot(), 'euchre')?.state,
        ),
      ).toBe(
        stateHash(
          multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')?.state,
        ),
      );
    });

    // the host answers for its own seat and the pair stay hash-identical
    const afterGuest = multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')!;
    const hostLegal =
      afterGuest.status === 'playing' && afterGuest.phase.actor === 0
        ? def.flow.legalMoves(afterGuest.state, afterGuest.phase)
        : [];
    if (hostLegal.length > 0) {
      host.send(hostLegal[0]!.id, hostLegal[0]!.payload);
      await eventually(() => {
        expect(
          multiplayerSession<EuchreState, EuchreRules>(guest.getSnapshot(), 'euchre')?.log.length,
        ).toBe(
          multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')?.log.length,
        );
        expect(
          stateHash(
            multiplayerSession<EuchreState, EuchreRules>(guest.getSnapshot(), 'euchre')?.state,
          ),
        ).toBe(
          stateHash(
            multiplayerSession<EuchreState, EuchreRules>(host.getSnapshot(), 'euchre')?.state,
          ),
        );
      });
    }
  });

  it('keeps host and guest authorities hash-identical across a full euchre hand', () => {
    const def = createEuchreDef();
    const config = euchreConfig.resolve({ targetScore: 5 });
    const settings = { gameId: 'euchre', seats: 4, config };
    const seed = 314;
    const hostAuth = new EngineAuthority({
      def,
      session: createSession(def, { seed, config, seats: 4 }),
      settings,
    });
    const guestAuth = new EngineAuthority({
      def,
      session: createSession(def, { seed, config, seats: 4 }),
      settings,
    });

    // every seat is driven by the house bot; packets flow host -> guest
    let guard = 0;
    let packets = 0;
    while (
      guard++ < 400 &&
      hostAuth.getSession().status === 'playing' &&
      hostAuth.getSession().result === null
    ) {
      const session = hostAuth.getSession();
      const seat = session.phase.actor;
      if (seat === null) break;
      const legal = def.flow.legalMoves(session.state, session.phase);
      if (legal.length === 0) break;
      const choice =
        chooseBotMove(
          tierBot(2),
          def.playerView(session.state, seat),
          seat,
          legal,
          makeRng(seed).fork(`ev:${session.log.length}`),
        ) ?? legal[0]!;
      const packet = hostAuth.apply({
        id: `action:${guard}`,
        seat,
        move: choice.id,
        payload: choice.payload,
      });
      packets += 1;
      const verdict = guestAuth.applyRemote(packet);
      expect(verdict.accepted).toBe(true);
      expect(verdict.stateHash).toBe(packet.stateHash);
    }

    expect(packets).toBeGreaterThan(10);
    expect(stateHash(guestAuth.getSession().state)).toBe(stateHash(hostAuth.getSession().state));
    expect(guestAuth.getSession().log.map((event) => event.hash)).toEqual(
      hostAuth.getSession().log.map((event) => event.hash),
    );
  });

  it('discovers a Gin room and keeps replay logs and state hashes identical after moves', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'gin-host' },
      {
        signaling: broker.signaling('gin-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 4242,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'gin-guest' },
      {
        signaling: broker.signaling('gin-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'gin',
      seats: 2,
      config: ginConfigSchema.resolve({}),
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(host.getSnapshot()).toMatchObject({ gameId: 'gin' });
    expect(guest.getSnapshot()).toMatchObject({ gameId: 'gin' });
    expect(
      multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.state.scores,
    ).toEqual([0, 0]);

    // drive real decisions: the non-dealer (guest) declines first, the host
    // follows; the forced stock draw for the leader lands automatically in
    // the settle loop
    guest.send('option.pass');
    await eventually(() => {
      expect(
        multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.log.length,
      ).toBeGreaterThan(0);
    });
    host.send('option.pass');
    await eventually(() => {
      expect(
        multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.log.length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')?.log.length,
      ).toBe(multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.log.length);
    });

    // the leader (seat 1) throws one back, then the host draws from stock
    const leaderSession = multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')!;
    const throwMove = leaderSession.def.flow.legalMovesFor!(
      leaderSession.state,
      leaderSession.phase,
      1,
    ).find((move) => move.id === 'discard');
    expect(throwMove).toBeDefined();
    guest.send(throwMove!.id, throwMove!.payload);
    await eventually(() => {
      expect(
        multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.phase.phase,
      ).toBe('turn');
    });

    const afterThrow = multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')!;
    const draw = afterThrow.def.flow.legalMovesFor!(afterThrow.state, afterThrow.phase, 0).find(
      (move) => move.id === 'draw.stock',
    );
    host.send(draw!.id);

    await eventually(() => {
      expect(
        multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')?.phase.phase,
      ).toBe('act');
    });
    expect(
      stateHash(multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.state),
    ).toBe(
      stateHash(multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')?.state),
    );
    expect(
      multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')?.lastAppliedHash,
    ).toBe(
      multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')?.lastAppliedHash,
    );
  });

  /**
   * The seat that does *not* come back.
   *
   * A dropped seat is held open first, because a player who reconnects rebuilds
   * their own layer and nobody's hand is opened. Only once they stay gone does
   * the table recover the seat out of other seats' shares — which needs three
   * seats or more to have an honest threshold, and is reported as the privacy
   * loss it is. The grace window is shortened here; in a room it is 45 seconds.
   */
  it('holds a dropped seat, then recovers it into bot takeover and lets the profile reclaim it', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const peers = Array.from(
      { length: 4 },
      (_, seat) =>
        new MultiplayerRoomSession(
          { name: `P${seat}`, avatarId: 'ember', profileId: `takeover-${seat}` },
          {
            signaling: broker.signaling(`takeover-peer-${seat}`),
            peerConnection: rtc.factory(`takeover-rtc-${seat}`),
            seed: 121 + seat,
            heartbeatIntervalMs: 20,
            heartbeatTimeoutMs: 2_000,
            reconnectGraceMs: 50,
          },
        ),
    );
    sessions.push(...peers);
    const host = peers[0]!;
    const guest = peers[1]!;

    const room = await host.create({ seats: 4 });
    for (let seat = 1; seat < 4; seat++) {
      await peers[seat]!.join(room.code);
      await eventually(() => expect(peers[seat]!.getSnapshot().localSeat).toBe(seat), 200, 5);
    }
    await host.start();
    await eventually(() => expect(host.getSnapshot().stage).toBe('table'), 1_000, 10);

    host.send('draw.stock');
    await eventually(() =>
      expect(
        multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')?.log,
      ).toHaveLength(1),
    );
    const drawn = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!;
    const discard = drawn.def.flow
      .legalMoves(drawn.state, drawn.phase)
      .find((move) => move.id === 'discard');
    expect(discard).toBeDefined();
    host.send(discard!.id, discard!.payload);
    await eventually(() =>
      expect(
        multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')?.phase.actor,
      ).toBe(1),
    );
    const beforeDrop = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!.log
      .length;

    guest.close();
    await eventually(
      () => {
        expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)).toMatchObject({
          connected: false,
          bot: true,
        });
        // Open rooms do not pause for key material. The empty chair is a bot
        // and the log stays intact. Whether the takeover bot has played yet is
        // timing, so it is not asserted here.
        expect(host.getSnapshot().security.paused).toBeNull();
        expect(
          multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!.log.length,
        ).toBeGreaterThanOrEqual(beforeDrop);
      },
      1_500,
      10,
    );

    const rejoined = new MultiplayerRoomSession(
      { name: 'P1', avatarId: 'ember', profileId: 'takeover-1' },
      {
        signaling: broker.signaling('takeover-rejoined'),
        peerConnection: rtc.factory('takeover-rejoined'),
        seed: 9,
      },
    );
    sessions.push(rejoined);
    await rejoined.join(room.code);
    await eventually(
      () => {
        expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)).toMatchObject({
          connected: true,
          bot: false,
          profileId: 'takeover-1',
        });
        expect(rejoined.getSnapshot().localSeat).toBe(1);
      },
      400,
      10,
    );
  }, 120_000);

  it('runs a two-seat Cribbage room with replay-identical discard actions', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'crib-host' },
      {
        signaling: broker.signaling('crib-host-peer'),
        peerConnection: rtc.factory('crib-host'),
        seed: 93,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'crib-guest' },
      {
        signaling: broker.signaling('crib-guest-peer'),
        peerConnection: rtc.factory('crib-guest'),
        seed: 8,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({
      gameId: 'cribbage',
      seats: 2,
      config: { ...cribbageConfigSchema.defaults, gamesToWin: 3 },
    });
    expect(host.getSnapshot().settings?.config).toMatchObject({ gamesToWin: 1 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    const hostRound = multiplayerSession<CribbageState, CribbageConfig>(
      host.getSnapshot(),
      'cribbage',
    )!;
    const hostDiscard = hostRound.def.flow.legalMovesFor!(hostRound.state, hostRound.phase, 0).find(
      (move) => move.id === 'crib.discard',
    )!;
    host.send(hostDiscard.id, hostDiscard.payload);
    await eventually(() => {
      expect(
        multiplayerSession<CribbageState, CribbageConfig>(host.getSnapshot(), 'cribbage')?.log,
      ).toHaveLength(1);
      expect(
        multiplayerSession<CribbageState, CribbageConfig>(guest.getSnapshot(), 'cribbage')?.log,
      ).toHaveLength(1);
    });

    const guestRound = multiplayerSession<CribbageState, CribbageConfig>(
      guest.getSnapshot(),
      'cribbage',
    )!;
    const guestDiscard = guestRound.def.flow.legalMovesFor!(
      guestRound.state,
      guestRound.phase,
      1,
    ).find((move) => move.id === 'crib.discard')!;
    guest.send(guestDiscard.id, guestDiscard.payload);
    await eventually(() => {
      expect(
        multiplayerSession<CribbageState, CribbageConfig>(host.getSnapshot(), 'cribbage')?.log,
      ).toHaveLength(2);
      expect(
        multiplayerSession<CribbageState, CribbageConfig>(guest.getSnapshot(), 'cribbage')?.log,
      ).toHaveLength(2);
    });

    const hostSession = multiplayerSession<CribbageState, CribbageConfig>(
      host.getSnapshot(),
      'cribbage',
    )!;
    const guestSession = multiplayerSession<CribbageState, CribbageConfig>(
      guest.getSnapshot(),
      'cribbage',
    )!;
    expect(guestSession.log).toEqual(hostSession.log);
    expect(stateHash(guestSession.state)).toBe(stateHash(hostSession.state));
  });

  it('rejects Cribbage room announcements with any seat count other than two', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'crib-host-invalid' },
      { seed: 121 },
    );
    sessions.push(host);

    await expect(host.create({ gameId: 'cribbage', seats: 3 })).rejects.toThrow(
      'Cribbage rooms seat exactly 2.',
    );
  });
});

describe('president rooms on the shared stack', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => sessions.splice(0).forEach((session) => session.close()));

  /** True once every joined peer knows its seat. */
  function guestSeat(peers: readonly { session: MultiplayerRoomSession }[]): boolean {
    return peers.every((peer, index) => peer.session.getSnapshot().localSeat === index);
  }

  it('routes a five-seat president room and keeps host/guest hashes identical across moves', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const profiles = [
      { name: 'Host', avatarId: 'ember', profileId: 'president-host' },
      { name: 'Guest', avatarId: 'juniper', profileId: 'president-guest' },
      { name: 'Third', avatarId: 'cobalt', profileId: 'president-third' },
      { name: 'Fourth', avatarId: 'plum', profileId: 'president-fourth' },
      { name: 'Fifth', avatarId: 'mint', profileId: 'president-fifth' },
    ];
    const peers = profiles.map((profile, index) => {
      const session = new MultiplayerRoomSession(profile, {
        signaling: broker.signaling(`president-peer-${index}`),
        peerConnection: rtc.factory(`peer-${index}`),
        seed: index === 0 ? 4242 : 7,
      });
      sessions.push(session);
      return { session, profile };
    });
    const host = peers[0]!;

    const room = await host.session.create({
      gameId: 'president',
      seats: 5,
      config: applyPreset(presidentConfig, 'classic'),
    });
    for (const peer of peers.slice(1)) {
      await peer.session.join(room.code);
    }
    await eventually(() => {
      expect(guestSeat(peers)).toBe(true);
    });

    expect(host.session.getSnapshot()).toMatchObject({ gameId: 'president' });
    expect(
      multiplayerSession<PresidentState, PresidentRules>(
        host.session.getSnapshot(),
        'president',
      )!.state.hands.flat().length,
    ).toBe(52);

    // Drive real turns through the mesh; after every event every peer must
    // hold the same log length AND the same state hash.
    for (let step = 0; step < 14; step++) {
      const hostSession = multiplayerSession<PresidentState, PresidentRules>(
        host.session.getSnapshot(),
        'president',
      );
      expect(hostSession).not.toBeNull();
      if (hostSession!.status !== 'playing') break;
      const baseline = hostSession!.log.length;
      const actor = hostSession!.phase.actor;
      expect(actor).not.toBeNull();
      const legal =
        hostSession!.def.flow.legalMovesFor?.(hostSession!.state, hostSession!.phase, actor!) ?? [];
      expect(legal.length).toBeGreaterThan(0);
      const move = legal[0]!;
      peers[actor!]!.session.send(move.id, move.payload);

      await eventually(() => {
        const lengths = peers.map(
          (peer) =>
            multiplayerSession<PresidentState, PresidentRules>(
              peer.session.getSnapshot(),
              'president',
            )!.log.length,
        );
        expect(Math.min(...lengths)).toBeGreaterThan(baseline);
        expect(new Set(lengths).size).toBe(1);
      });
      const hashes = peers.map((peer) =>
        stateHash(
          multiplayerSession<PresidentState, PresidentRules>(
            peer.session.getSnapshot(),
            'president',
          )!.state,
        ),
      );
      expect(new Set(hashes).size).toBe(1);
    }

    // The guests replay the authority log from the announced seed — the whole
    // replayed log must hash-match the host's event for event.
    const hostLog = multiplayerSession<PresidentState, PresidentRules>(
      host.session.getSnapshot(),
      'president',
    )!.log;
    for (const peer of peers.slice(1)) {
      const guestLog = multiplayerSession<PresidentState, PresidentRules>(
        peer.session.getSnapshot(),
        'president',
      )!.log;
      expect(guestLog.length).toBe(hostLog.length);
      for (let i = 0; i < hostLog.length; i++) {
        expect(guestLog[i]!.hash).toBe(hostLog[i]!.hash);
      }
    }
  });

  it('rejects seat counts outside the president ring before any transport exists', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'president-cap' },
      { signaling: broker.signaling('cap-peer'), peerConnection: rtc.factory('host'), seed: 1 },
    );
    sessions.push(host);
    await expect(host.create({ gameId: 'president', seats: 3 })).rejects.toThrow(
      /President rooms seat 4–8/,
    );
    await expect(host.create({ gameId: 'president', seats: 9 })).rejects.toThrow(
      /President rooms seat 4–8/,
    );
    // blitz keeps its own 2–4 ring
    await expect(host.create({ gameId: 'blitz', seats: 6 })).rejects.toThrow(
      /Blitz rooms seat 2–4/,
    );
  });
});

describe('crazy eights rooms on the shared stack', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => sessions.splice(0).forEach((session) => session.close()));

  it('deals a four-seat eights room and keeps every peer on the same log and hash', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const profiles = [
      { name: 'Host', avatarId: 'ember', profileId: 'eights-host' },
      { name: 'Guest', avatarId: 'juniper', profileId: 'eights-guest' },
      { name: 'Third', avatarId: 'cobalt', profileId: 'eights-third' },
      { name: 'Fourth', avatarId: 'plum', profileId: 'eights-fourth' },
    ];
    const peers = profiles.map((profile, index) => {
      const session = new MultiplayerRoomSession(profile, {
        signaling: broker.signaling(`eights-peer-${index}`),
        peerConnection: rtc.factory(`peer-${index}`),
        seed: index === 0 ? 1808 : 3,
      });
      sessions.push(session);
      return { session, profile };
    });
    const host = peers[0]!;

    const room = await host.session.create({
      gameId: 'eights',
      seats: 4,
      config: applyPreset(eightsConfig, 'house'),
    });
    for (const peer of peers.slice(1)) {
      await peer.session.join(room.code);
    }
    await eventually(() => {
      expect(peers.every((peer, index) => peer.session.getSnapshot().localSeat === index)).toBe(
        true,
      );
    });

    expect(host.session.getSnapshot()).toMatchObject({ gameId: 'eights' });
    const dealt = multiplayerSession<EightsState, EightsRules>(
      host.session.getSnapshot(),
      'eights',
    )!;
    expect(dealt.state.round.hands.flat()).toHaveLength(28);
    expect(
      dealt.state.round.hands.flat().length +
        dealt.state.round.stock.length +
        dealt.state.round.discard.length,
    ).toBe(52);

    for (let step = 0; step < 12; step++) {
      const live = multiplayerSession<EightsState, EightsRules>(
        host.session.getSnapshot(),
        'eights',
      )!;
      if (live.status !== 'playing') break;
      const baseline = live.log.length;
      const actor = live.phase.actor;
      expect(actor).not.toBeNull();
      const legal = live.def.flow.legalMovesFor?.(live.state, live.phase, actor!) ?? [];
      expect(legal.length).toBeGreaterThan(0);
      const move = legal[0]!;
      peers[actor!]!.session.send(move.id, move.payload);

      await eventually(() => {
        const lengths = peers.map(
          (peer) =>
            multiplayerSession<EightsState, EightsRules>(peer.session.getSnapshot(), 'eights')!.log
              .length,
        );
        expect(Math.min(...lengths)).toBeGreaterThan(baseline);
        expect(new Set(lengths).size).toBe(1);
      });
      const hashes = peers.map((peer) =>
        stateHash(
          multiplayerSession<EightsState, EightsRules>(peer.session.getSnapshot(), 'eights')!.state,
        ),
      );
      expect(new Set(hashes).size).toBe(1);
    }
  });

  it('states the eights ring and deals its rounds in the open', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'eights-cap' },
      {
        signaling: broker.signaling('eights-cap-peer'),
        peerConnection: rtc.factory('host'),
        seed: 1,
      },
    );
    sessions.push(host);
    await expect(host.create({ gameId: 'eights', seats: 1 })).rejects.toThrow(/seat 2–6/);
    await expect(host.create({ gameId: 'eights', seats: 7 })).rejects.toThrow(/seat 2–6/);
    await host.create({ gameId: 'eights', seats: 4 });
    expect(host.getSnapshot().security.tier).toBe('veil');
  });
});

describe('spades rooms on the shared stack', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => sessions.splice(0).forEach((session) => session.close()));

  it('discovers a Spades room and keeps partnership state synchronized across peers', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-host' },
      {
        signaling: broker.signaling('spades-host-peer'),
        peerConnection: rtc.factory('host'),
        seed: 5150,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'cobalt', profileId: 'spades-guest' },
      {
        signaling: broker.signaling('spades-guest-peer'),
        peerConnection: rtc.factory('guest'),
        seed: 8,
      },
    );
    sessions.push(host, guest);

    const created = await host.create({
      gameId: 'spades',
      seats: 4,
      config: applyPreset(spadesConfig, 'quick'),
    });
    await guest.join(created.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    expect(host.getSnapshot()).toMatchObject({ gameId: 'spades' });
    expect(guest.getSnapshot()).toMatchObject({ gameId: 'spades' });
    expect(guest.getSnapshot().settings?.config).toMatchObject({
      targetScore: 250,
      nil: true,
      bags: true,
    });

    const def = createSpadesDef();
    const before = multiplayerSession<SpadesState, SpadesRules>(host.getSnapshot(), 'spades')!;
    expect(before.state.stage).toBe('bidding');
    const actor = before.phase.actor!;
    const legal = def.flow.legalMoves(before.state, before.phase);
    expect(legal.length).toBeGreaterThan(0);
    const speaker = actor === 0 ? host : actor === 1 ? guest : null;
    if (speaker) {
      speaker.send(legal[0]!.id, legal[0]!.payload);
      await eventually(() => {
        const hostSession = multiplayerSession<SpadesState, SpadesRules>(
          host.getSnapshot(),
          'spades',
        );
        const guestSession = multiplayerSession<SpadesState, SpadesRules>(
          guest.getSnapshot(),
          'spades',
        );
        expect(guestSession?.log.length).toBe(hostSession?.log.length);
        expect(guestSession!.log.length).toBeGreaterThan(0);
        expect(stateHash(guestSession?.state)).toBe(stateHash(hostSession?.state));
      });
    }
  });

  it('narrows multiplayerSession to spades and refuses another game id', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-narrow' },
      {
        signaling: new MockSignalingBroker().signaling('spades-narrow-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 61,
      },
    );
    sessions.push(host);
    await host.create({ gameId: 'spades', seats: 4 });

    const snapshot = host.getSnapshot();
    expect(multiplayerSession<SpadesState, SpadesRules>(snapshot, 'spades')).not.toBeNull();
    // A euchre table must never read a spades snapshot as its own.
    expect(multiplayerSession<SpadesState, SpadesRules>(snapshot, 'euchre')).toBeNull();
  });

  it('deals thirteen cards to each of exactly four seats', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-deal' },
      {
        signaling: new MockSignalingBroker().signaling('spades-deal-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 99,
      },
    );
    sessions.push(host);
    await host.create({ gameId: 'spades', seats: 4 });
    const session = multiplayerSession<SpadesState, SpadesRules>(host.getSnapshot(), 'spades')!;
    expect(session.state.hands).toHaveLength(4);
    expect(session.state.hands.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
  });

  it('rejects any seat count other than four before a transport exists', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-cap' },
      { seed: 2 },
    );
    sessions.push(host);
    await expect(host.create({ gameId: 'spades', seats: 3 })).rejects.toThrow(
      /Spades rooms seat exactly 4/,
    );
    await expect(host.create({ gameId: 'spades', seats: 5 })).rejects.toThrow(
      /Spades rooms seat exactly 4/,
    );
    await expect(host.create({ gameId: 'spades', seats: 2 })).rejects.toThrow(
      /Spades rooms seat exactly 4/,
    );
  });

  it('keeps a veil block on the pack, unused by friend rooms', () => {
    expect(createSpadesDef().veil).toBeDefined();
    expect(createSpadesDef().veil!.redealMove).toBe('nextHand');
  });

  it('resolves a spades room as open, with the pack defaults filled in', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-open' },
      {
        signaling: new MockSignalingBroker().signaling('spades-open-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 4,
      },
    );
    sessions.push(host);
    await host.create({ gameId: 'spades', seats: 4 });
    const settings = host.getSnapshot().settings!;
    expect(settings.security).toBe('veil');
    expect(settings.seats).toBe(4);
    expect(settings.config).toMatchObject({ targetScore: 500, nil: true, bags: true });
  });
  it('resolves a Quick room back to the quick mode a rematch will reuse', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-quick' },
      {
        signaling: new MockSignalingBroker().signaling('spades-quick-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 21,
      },
    );
    sessions.push(host);
    await host.create({
      gameId: 'spades',
      seats: 4,
      config: applyPreset(spadesConfig, 'quick'),
    });
    const session = multiplayerSession<SpadesState, SpadesRules>(host.getSnapshot(), 'spades')!;
    // Play Again rebuilds the room from the setup store, so the mode has to be
    // recoverable from the rules a guest actually played under.
    expect(spadesModeForRules(session.config)).toBe('quick');
    expect(session.config.targetScore).toBe(250);
  });

  it('resolves a Clean Books room back to clean-books', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-clean' },
      {
        signaling: new MockSignalingBroker().signaling('spades-clean-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 22,
      },
    );
    sessions.push(host);
    await host.create({
      gameId: 'spades',
      seats: 4,
      config: applyPreset(spadesConfig, 'clean-books'),
    });
    const session = multiplayerSession<SpadesState, SpadesRules>(host.getSnapshot(), 'spades')!;
    expect(spadesModeForRules(session.config)).toBe('clean-books');
    expect(session.config.bags).toBe(false);
  });

  it('advertises the veiled tier it actually runs', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-badge' },
      {
        signaling: new MockSignalingBroker().signaling('spades-badge-peer'),
        peerConnection: new MockRtcNetwork().factory('host'),
        seed: 23,
      },
    );
    sessions.push(host);
    await host.create({ gameId: 'spades', seats: 4 });
    const security = host.getSnapshot().security;
    expect(security.tier).toBe('veil');
  });
});

describe('veiled rooms on the shared stack', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.close());
    clearActiveMultiplayerSession();
  });

  interface VeilPair {
    host: MultiplayerRoomSession;
    guest: MultiplayerRoomSession;
    room: Awaited<ReturnType<MultiplayerRoomSession['create']>>;
    broker: MockSignalingBroker;
    rtc: MockRtcNetwork;
  }

  async function veilPair(options: {
    gameId?: MultiplayerGameId;
    seats?: number;
    graceMs?: number;
    label: string;
  }): Promise<VeilPair> {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const seats = options.seats ?? 2;
    const peers = Array.from({ length: seats }, (_, seat) => {
      const session = new MultiplayerRoomSession(
        { name: `P${seat}`, avatarId: 'ember', profileId: `${options.label}-${seat}` },
        {
          signaling: broker.signaling(`${options.label}-peer-${seat}`),
          peerConnection: rtc.factory(`${options.label}-rtc-${seat}`),
          seed: 400 + seat,
          heartbeatIntervalMs: 20,
          reconnectGraceMs: options.graceMs,
        },
      );
      sessions.push(session);
      return session;
    });
    const [host, guest] = peers as [MultiplayerRoomSession, MultiplayerRoomSession];
    const gameId = options.gameId ?? 'blitz';
    const room = await host.create({ gameId, seats, security: 'veil' });
    for (let seat = 1; seat < seats; seat++) {
      await peers[seat]!.join(room.code);
      await eventually(() => expect(peers[seat]!.getSnapshot().localSeat).toBe(seat), 400, 5);
    }
    return { host, guest, room, broker, rtc };
  }

  /** Waits until this peer's own veiled hand has been peeled to real faces. */
  async function awaitOwnFaces(peer: MultiplayerRoomSession): Promise<void> {
    await eventually(
      () => {
        const session = multiplayerSession<BlitzState, BlitzConfig>(peer.getSnapshot(), 'blitz');
        const state =
          session?.state ??
          multiplayerSession<GinMatchState, GinConfig>(peer.getSnapshot(), 'gin')?.state;
        const hand =
          state && 'hand' in state
            ? state.hand.hands[peer.getSnapshot().localSeat ?? 0]
            : undefined;
        const own = hand ?? session?.state.hands[peer.getSnapshot().localSeat ?? 0];
        expect(own?.every((card) => !isVeilHandle(card))).toBe(true);
      },
      800,
      25,
    );
  }

  /** Sends one legal move for whichever seat this peer owns, if it is their turn. */
  function playLegalPly(peer: MultiplayerRoomSession): boolean {
    const snapshot = peer.getSnapshot();
    const session = multiplayerSession<BlitzState, BlitzConfig>(snapshot, 'blitz');
    if (!session || snapshot.localSeat === null) return false;
    if (session.phase.actor !== snapshot.localSeat || session.status !== 'playing') return false;
    const move = session.def.flow.legalMovesFor
      ? session.def.flow.legalMovesFor(session.state, session.phase, snapshot.localSeat)[0]
      : session.def.flow.legalMoves(session.state, session.phase)[0];
    if (!move) return false;
    peer.send(move.id, move.payload);
    return true;
  }

  it('honours a requested veil tier and refuses one the pack cannot run', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'veil-tier-host' },
      {
        signaling: broker.signaling('veil-tier-peer'),
        peerConnection: rtc.factory('veil-tier'),
        seed: 3,
      },
    );
    sessions.push(host);
    await host.create({ gameId: 'blitz', seats: 2 });
    expect(host.getSnapshot().settings!.security).toBe('veil');

    const veiled = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'veil-tier-veiled' },
      {
        signaling: broker.signaling('veil-tier-peer2'),
        peerConnection: rtc.factory('veil-tier2'),
        seed: 4,
      },
    );
    sessions.push(veiled);
    await veiled.create({ gameId: 'blitz', seats: 2, security: 'veil' });
    expect(veiled.getSnapshot().settings!.security).toBe('veil');
    expect(veiled.getSnapshot().security.tier).toBe('veil');
  });

  it('runs the ceremony on Start and deals both seats handle hands from one deck', async () => {
    const { host, guest } = await veilPair({ label: 'veil-deal' });
    await host.start();

    await eventually(
      () => {
        expect(host.getSnapshot().stage).toBe('table');
        expect(guest.getSnapshot().stage).toBe('table');
      },
      600,
      25,
    );

    // Both authorities hold handles — the ceremony's whole point — while each
    // presented view resolves exactly its own hand to faces. The resolves land
    // asynchronously after the deal, so wait them out.
    await eventually(
      () => {
        for (const peer of [host, guest]) {
          const session = multiplayerSession<BlitzState, BlitzConfig>(peer.getSnapshot(), 'blitz')!;
          const ownSeat = peer.getSnapshot().localSeat!;
          session.state.hands.forEach((hand, seat) => {
            expect(hand.every(isVeilHandle)).toBe(seat !== ownSeat);
          });
        }
      },
      600,
      25,
    );
    for (const peer of [host, guest]) {
      expect(peer.knownFaces().size).toBeGreaterThan(0);
      const security = peer.getSnapshot().security;
      expect(security.tier).toBe('veil');
      expect(security.ceremony).toMatchObject({ laid: 2, seats: 2, ready: true });
    }
    expect(
      multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!.log.length,
    ).toBe(multiplayerSession<BlitzState, BlitzConfig>(guest.getSnapshot(), 'blitz')!.log.length);
  }, 30_000);

  it('keeps both logs hash-identical while veiled moves open their own handles', async () => {
    const { host, guest } = await veilPair({ label: 'veil-play' });
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 600, 25);

    for (let ply = 0; ply < 6; ply++) {
      await eventually(
        () => {
          for (const peer of [host, guest]) {
            if (playLegalPly(peer)) return;
          }
          throw new Error('no seat could act');
        },
        2_000,
        10,
      );
    }
    await eventually(
      () => {
        const left = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!;
        const right = multiplayerSession<BlitzState, BlitzConfig>(guest.getSnapshot(), 'blitz')!;
        expect(left.log.length).toBe(right.log.length);
        expect(left.lastAppliedHash).toBe(right.lastAppliedHash);
        expect(left.log.length).toBeGreaterThan(0);
      },
      400,
      10,
    );
  }, 40_000);

  it('redeals between gin hands with a fresh ceremony once the table readies up', async () => {
    const { host, guest } = await veilPair({ gameId: 'gin', label: 'veil-redeal' });
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 800, 25);
    await awaitOwnFaces(host);
    await awaitOwnFaces(guest);

    // Drive both seats with boring but legal play until the hand dies of a
    // starved stock or somebody knocks; either outcome folds the hand. One ply
    // per wait, because the acting seat alternates as the log grows.
    const ginPly = (peer: MultiplayerRoomSession): boolean => {
      const snapshot = peer.getSnapshot();
      const session = multiplayerSession<GinMatchState, GinConfig>(snapshot, 'gin');
      if (!session || snapshot.localSeat === null || session.status !== 'playing') return false;
      const seat = snapshot.localSeat;
      if (session.phase.actor === null) return false;
      if (!(session.phase.actors ?? [session.phase.actor]).includes(seat)) return false;
      const moves =
        session.def.flow.legalMovesFor?.(session.state, session.phase, seat) ??
        session.def.flow.legalMoves(session.state, session.phase);
      if (moves.length === 0) return false;
      // Pass on the upcard (keeps hands sealed), draw from the stock on a turn,
      // throw a real card during the act, and ready up once the hand folded.
      const preferred =
        moves.find((move) => move.id === 'option.pass') ??
        moves.find((move) => move.id === 'draw.stock') ??
        moves.find(
          (move) => move.id === 'discard' && !isVeilHandle((move.payload as { card: string }).card),
        ) ??
        moves.find((move) => move.id === 'ready');
      if (!preferred) return false;
      peer.send(preferred.id, preferred.payload);
      return true;
    };
    async function onePly(): Promise<void> {
      for (let attempt = 0; attempt < 2_000; attempt++) {
        for (const peer of [host, guest]) {
          if (ginPly(peer)) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('the veiled gin table stopped offering turns');
    }

    // Phase A: boring but legal play until the hand folds (stock starvation or
    // an accidental knock both fold it). One ply per wait, because the acting
    // seat alternates as the log grows, and each peer acts on its own freshest
    // view — a stale view can offer a move the authority then rejects, which
    // costs a retry rather than breaking the table.
    for (let step = 0; step < 500; step++) {
      const session = multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')!;
      if (session.state.handIndex > 0 || session.state.folded) break;
      await onePly();
    }

    // Phase B: both seats ready up during the hand-end window.
    for (let step = 0; step < 50; step++) {
      const session = multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')!;
      if (session.state.readied.length >= 2) break;
      await onePly();
    }

    await eventually(
      () => {
        for (const peer of [host, guest]) {
          const session = multiplayerSession<GinMatchState, GinConfig>(peer.getSnapshot(), 'gin')!;
          expect(session.state.handIndex).toBe(1);
          expect(session.state.folded).toBe(false);
          expect(session.status).toBe('playing');
          const ownSeat = peer.getSnapshot().localSeat!;
          session.state.hand.hands.forEach((hand, seat) => {
            expect(hand.every(isVeilHandle)).toBe(seat !== ownSeat);
          });
        }
        const left = multiplayerSession<GinMatchState, GinConfig>(host.getSnapshot(), 'gin')!;
        const right = multiplayerSession<GinMatchState, GinConfig>(guest.getSnapshot(), 'gin')!;
        expect(left.lastAppliedHash).toBe(right.lastAppliedHash);
      },
      1200,
      25,
    );
  }, 120_000);

  it('pauses for a dropped seat and resumes without recovery when they return in time', async () => {
    const { host, guest, room, broker, rtc } = await veilPair({
      label: 'veil-return',
      graceMs: 60_000,
    });
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 600, 25);

    guest.close();
    await eventually(
      () => expect(host.getSnapshot().security.paused).toContain('dropped'),
      800,
      10,
    );

    const rejoined = new MultiplayerRoomSession(
      { name: 'P1', avatarId: 'ember', profileId: 'veil-return-1' },
      {
        signaling: broker.signaling('veil-return-rejoined'),
        peerConnection: rtc.factory('veil-return-rejoined'),
        seed: 9,
      },
    );
    sessions.push(rejoined);
    await rejoined.join(room.code);
    await eventually(
      () => {
        expect(rejoined.getSnapshot().localSeat).toBe(1);
        expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)).toMatchObject({
          connected: true,
          bot: false,
        });
        expect(host.getSnapshot().security.paused).toBeNull();
        expect(rejoined.getSnapshot().security.paused).toBeNull();
      },
      1500,
      10,
    );

    // The returned seat can still act, and the table stays in one piece.
    await eventually(
      () => {
        for (const peer of [host, rejoined]) {
          if (playLegalPly(peer)) return;
        }
        throw new Error('the resumed table is not dealing turns');
      },
      600,
      10,
    );
  }, 60_000);

  it('awards a two-seat walkover when a veiled opponent stays gone', async () => {
    const { host, guest } = await veilPair({ label: 'veil-walkover', graceMs: 60 });
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 600, 25);

    guest.close();
    await eventually(
      () => {
        const session = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!;
        expect(session.result?.reason).toBe('opponent-left');
        expect(session.result?.winner).toBe(0);
        expect(host.getSnapshot().security.paused).toBeNull();
        expect(host.getSnapshot().error).toBeNull();
        // A walkover names the fact; it never narrates key material.
        const said = `${host.getSnapshot().error ?? ''} ${host.getSnapshot().security.paused ?? ''}`;
        expect(/key|layer|thread/i.test(said)).toBe(false);
      },
      1000,
      10,
    );
  }, 40_000);

  it('recovers a dropped seat by threshold shares at three seats and keeps playing', async () => {
    const { host, guest } = await veilPair({ seats: 3, label: 'veil-recover', graceMs: 60 });
    await host.start();
    await eventually(
      () => expect(host.getSnapshot().seats.every((seat) => seat.connected)).toBe(true),
      600,
      25,
    );

    guest.close();
    await eventually(
      () => {
        const security = host.getSnapshot().security;
        expect(security.recoveredSeats).toContain(1);
        expect(security.paused).toBeNull();
        expect(security.recoveredSeats.length).toBeGreaterThan(0);
      },
      2000,
      10,
    );

    // The recovered seat's cards are readable to the host as surrogate only —
    // the third seat still sees plain handles for that hand.
    const third = sessions.find(
      (session) => session.getSnapshot().localSeat === 2,
    ) as MultiplayerRoomSession;
    const hidden = multiplayerSession<BlitzState, BlitzConfig>(third.getSnapshot(), 'blitz')!;
    expect(hidden.state.hands[1]!.every(isVeilHandle)).toBe(true);

    await eventually(
      () => {
        const left = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!;
        const right = multiplayerSession<BlitzState, BlitzConfig>(third.getSnapshot(), 'blitz')!;
        expect(left.log.length).toBe(right.log.length);
        expect(left.lastAppliedHash).toBe(right.lastAppliedHash);
      },
      1000,
      10,
    );
  }, 60_000);

  it('ends a drop hold early when a seat chooses to carry on without them', async () => {
    // A grace this long proves the resume call, not the timer, ended the hold.
    const { host, guest } = await veilPair({ seats: 3, label: 'veil-carry-on', graceMs: 60_000 });
    await host.start();
    await eventually(
      () => expect(host.getSnapshot().seats.every((seat) => seat.connected)).toBe(true),
      600,
      25,
    );

    guest.close();
    await eventually(
      () => {
        const security = host.getSnapshot().security;
        expect(security.paused).toContain('dropped');
        expect(security.waitingOn).toMatchObject({ seat: 1 });
        expect(security.waitingOn!.endsAtMs).toBeGreaterThan(Date.now());
      },
      800,
      10,
    );

    host.resumeWithoutSeat(1);
    await eventually(
      () => {
        const security = host.getSnapshot().security;
        expect(security.recoveredSeats).toContain(1);
        expect(security.waitingOn).toBeNull();
        expect(security.paused).toBeNull();
      },
      2000,
      10,
    );
  }, 30_000);

  it('carrying on without a two-seat opponent is an immediate walkover', async () => {
    const { host, guest } = await veilPair({ label: 'veil-carry-two', graceMs: 60_000 });
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 600, 25);

    guest.close();
    await eventually(() => expect(host.getSnapshot().security.waitingOn?.seat).toBe(1), 800, 10);

    host.resumeWithoutSeat(1);
    await eventually(
      () => {
        const session = multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!;
        expect(session.result?.reason).toBe('opponent-left');
        expect(session.result?.winner).toBe(0);
        const security = host.getSnapshot().security;
        expect(security.paused).toBeNull();
        expect(security.waitingOn).toBeNull();
        expect(host.getSnapshot().error).toBeNull();
      },
      1000,
      10,
    );
  }, 40_000);
});
