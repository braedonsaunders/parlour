import { applyPreset, stateHash } from '@parlour/engine';
import { ratscrewConfigSchema, type RatscrewState } from '@parlour/game-ratscrew';
import { wildpileConfig } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { NostrSignaling, type SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';
import {
  MultiplayerRoomSession,
  ratscrewMultiplayerSession,
  wildMultiplayerSession,
} from './roomSession';

type SignalHandler = (sender: string, signal: SignalPayload) => void;

class MockSignalingBroker {
  readonly rooms = new Map<string, { hostPubkey: string; settings: RoomSettings }>();
  readonly handlers = new Map<string, Map<string, SignalHandler>>();

  signaling(publicKey: string): NostrSignaling {
    const broker = this;
    return {
      publicKey,
      async announce(code: string, settings: RoomSettings) {
        broker.rooms.set(code, { hostPubkey: publicKey, settings });
      },
      async resolve(code: string) {
        const room = broker.rooms.get(code);
        if (!room) throw new Error('Room not found');
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

async function eventually(assertion: () => void) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  assertion();
}

describe('multiplayer route composition', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => sessions.splice(0).forEach((session) => session.close()));

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
    expect(guest.getSnapshot().settings?.config).toMatchObject({ stackDrawTwo: true, stackDrawFour: true, jumpIn: true });

    const hostSession = wildMultiplayerSession(host.getSnapshot());
    expect(hostSession).not.toBeNull();
    const move = hostSession!.def.flow.legalMoves(hostSession!.state, hostSession!.phase)[0];
    expect(move).toBeDefined();
    host.send(move!.id, move!.payload);

    await eventually(() => {
      expect(wildMultiplayerSession(host.getSnapshot())?.log).toHaveLength(1);
      expect(wildMultiplayerSession(guest.getSnapshot())?.log).toHaveLength(1);
    });
    expect(stateHash(wildMultiplayerSession(guest.getSnapshot())?.state)).toBe(
      stateHash(wildMultiplayerSession(host.getSnapshot())?.state),
    );
  });

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
    expect(ratscrewMultiplayerSession(guest.getSnapshot())).not.toBeNull();

    // Drive a slice of real play: flips until a window opens, then both seats
    // slam at once — arrival order on the authority decides the winner.
    const stateOf = (session: ReturnType<typeof ratscrewMultiplayerSession>) =>
      session!.state as RatscrewState;
    let windowsSeen = 0;
    for (let step = 0; step < 60; step++) {
      const hostSession = ratscrewMultiplayerSession(host.getSnapshot())!;
      if (hostSession.status !== 'playing') break;
      const state = stateOf(hostSession);
      if (state.window) {
        windowsSeen += 1;
        // both peers slap; whichever intent lands first takes the pile
        host.send('slap');
        guest.send('slap');
        await eventually(() => {
          expect(ratscrewMultiplayerSession(host.getSnapshot())?.state.window).toBeNull();
          expect(ratscrewMultiplayerSession(guest.getSnapshot())?.state.window).toBeNull();
        });
      } else {
        const before = ratscrewMultiplayerSession(host.getSnapshot())!.log.length;
        const turn = state.turn;
        (turn === 0 ? host : guest).send('flip');
        await eventually(() => {
          const h = ratscrewMultiplayerSession(host.getSnapshot())!;
          const g = ratscrewMultiplayerSession(guest.getSnapshot())!;
          expect(h.log.length).toBeGreaterThan(before);
          expect(g.log.length).toBe(h.log.length);
        });
      }
      // every authority event replays identically on the guest
      // (`ts` is transport wall-clock garnish and never part of state)
      const settledHost = ratscrewMultiplayerSession(host.getSnapshot())!;
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
      expect(strip(ratscrewMultiplayerSession(guest.getSnapshot())!.log)).toEqual(
        strip(settledHost.log),
      );
    }
    expect(windowsSeen).toBeGreaterThan(0);

    // final authority identity across every flip, slap and auto-resolved event
    const hostFinal = ratscrewMultiplayerSession(host.getSnapshot())!;
    const guestFinal = ratscrewMultiplayerSession(guest.getSnapshot())!;
    expect(guestFinal.log.map((event) => event.hash)).toEqual(
      hostFinal.log.map((event) => event.hash),
    );
    expect(stateHash(guestFinal.state)).toBe(stateHash(hostFinal.state));
    expect(stateHash(guestFinal.state)).toBe(hostFinal.lastAppliedHash);
  }, 30_000);
});
