import { applyPreset, stateHash } from '@parlour/engine';
import {
  chooseBotMove,
  createSession,
  makeRng,
} from '@parlour/engine';
import { createEuchreDef, euchreConfig, tierBot } from '@parlour/game-euchre';
import { wildpileConfig } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineAuthority } from '@/lib/multiplayer';
import { NostrSignaling, type SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';
import { MultiplayerRoomSession, euchreMultiplayerSession, wildMultiplayerSession } from './roomSession';

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
    const before = euchreMultiplayerSession(host.getSnapshot())!;
    const legal = def.flow.legalMoves(before.state, before.phase);
    expect(legal.length).toBeGreaterThan(0);
    guest.send(legal[0]!.id, legal[0]!.payload);

    await eventually(() => {
      const hostLog = euchreMultiplayerSession(host.getSnapshot())?.log ?? [];
      const guestLog = euchreMultiplayerSession(guest.getSnapshot())?.log ?? [];
      expect(guestLog.length).toBe(hostLog.length);
      expect(guestLog.length).toBeGreaterThan(0);
      expect(stateHash(euchreMultiplayerSession(guest.getSnapshot())?.state)).toBe(
        stateHash(euchreMultiplayerSession(host.getSnapshot())?.state),
      );
    });

    // the host answers for its own seat and the pair stay hash-identical
    const afterGuest = euchreMultiplayerSession(host.getSnapshot())!;
    const hostLegal =
      afterGuest.status === 'playing' && afterGuest.phase.actor === 0
        ? def.flow.legalMoves(afterGuest.state, afterGuest.phase)
        : [];
    if (hostLegal.length > 0) {
      host.send(hostLegal[0]!.id, hostLegal[0]!.payload);
      await eventually(() => {
        expect(euchreMultiplayerSession(guest.getSnapshot())?.log.length).toBe(
          euchreMultiplayerSession(host.getSnapshot())?.log.length,
        );
        expect(stateHash(euchreMultiplayerSession(guest.getSnapshot())?.state)).toBe(
          stateHash(euchreMultiplayerSession(host.getSnapshot())?.state),
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
      const choice = chooseBotMove(
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
});
