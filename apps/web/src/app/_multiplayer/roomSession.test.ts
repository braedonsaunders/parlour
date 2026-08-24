import {
  applyPreset,
  chooseBotMove,
  createSession,
  isVeilHandle,
  makeRng,
  stateHash,
} from '@parlour/engine';
import { cribbageConfigSchema } from '@parlour/game-cribbage';
import { createEuchreDef, euchreConfig, tierBot } from '@parlour/game-euchre';
import { ginConfigSchema } from '@parlour/game-gin';
import { presidentConfig } from '@parlour/game-president';
import { wildpileConfig } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineAuthority } from '@/lib/multiplayer';
import { NostrSignaling, type SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';
import {
  blitzMultiplayerSession,
  cribbageMultiplayerSession,
  euchreMultiplayerSession,
  ginMultiplayerSession,
  MultiplayerRoomSession,
  presidentMultiplayerSession,
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

  it('runs the live Veil ceremony with each peer in its assigned seat', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'veil-host' },
      {
        signaling: broker.signaling('veil-host-peer'),
        peerConnection: rtc.factory('veil-host'),
        seed: 44,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'veil-guest' },
      {
        signaling: broker.signaling('veil-guest-peer'),
        peerConnection: rtc.factory('veil-guest'),
        seed: 8,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2, security: 'veil' });
    await guest.join(room.code);
    await eventually(() => {
      expect(host.getSnapshot().seats).toHaveLength(2);
      expect(guest.getSnapshot().localSeat).toBe(1);
    });
    await host.start();
    await eventually(
      () => {
        expect(host.getSnapshot().security.ceremony.ready).toBe(true);
        expect(guest.getSnapshot().security.ceremony.ready).toBe(true);
        expect(host.getSnapshot().stage).toBe('table');
        expect(guest.getSnapshot().stage).toBe('table');
        const hostState = blitzMultiplayerSession(host.getSnapshot())!.state;
        const guestState = blitzMultiplayerSession(guest.getSnapshot())!.state;
        expect(hostState.hands[0]!.some(isVeilHandle)).toBe(false);
        expect(hostState.hands[1]!.every(isVeilHandle)).toBe(true);
        expect(guestState.hands[1]!.some(isVeilHandle)).toBe(false);
        expect(guestState.hands[0]!.every(isVeilHandle)).toBe(true);
      },
      1_000,
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
    expect(ginMultiplayerSession(guest.getSnapshot())?.state.scores).toEqual([0, 0]);

    // drive real decisions: the non-dealer (guest) declines first, the host
    // follows; the forced stock draw for the leader lands automatically in
    // the settle loop
    guest.send('option.pass');
    await eventually(() => {
      expect(ginMultiplayerSession(guest.getSnapshot())?.log.length).toBeGreaterThan(0);
    });
    host.send('option.pass');
    await eventually(() => {
      expect(ginMultiplayerSession(guest.getSnapshot())?.log.length).toBeGreaterThanOrEqual(3);
      expect(ginMultiplayerSession(host.getSnapshot())?.log.length).toBe(
        ginMultiplayerSession(guest.getSnapshot())?.log.length,
      );
    });

    // the leader (seat 1) throws one back, then the host draws from stock
    const leaderSession = ginMultiplayerSession(host.getSnapshot())!;
    const throwMove = leaderSession.def.flow.legalMovesFor!(
      leaderSession.state,
      leaderSession.phase,
      1,
    ).find((move) => move.id === 'discard');
    expect(throwMove).toBeDefined();
    guest.send(throwMove!.id, throwMove!.payload);
    await eventually(() => {
      expect(ginMultiplayerSession(guest.getSnapshot())?.phase.phase).toBe('turn');
    });

    const afterThrow = ginMultiplayerSession(host.getSnapshot())!;
    const draw = afterThrow.def.flow.legalMovesFor!(afterThrow.state, afterThrow.phase, 0).find(
      (move) => move.id === 'draw.stock',
    );
    host.send(draw!.id);

    await eventually(() => {
      expect(ginMultiplayerSession(host.getSnapshot())?.phase.phase).toBe('act');
    });
    expect(stateHash(ginMultiplayerSession(guest.getSnapshot())?.state)).toBe(
      stateHash(ginMultiplayerSession(host.getSnapshot())?.state),
    );
    expect(ginMultiplayerSession(guest.getSnapshot())?.lastAppliedHash).toBe(
      ginMultiplayerSession(host.getSnapshot())?.lastAppliedHash,
    );
  });

  it('forces a dropped seat into bot takeover, plays its turn, and lets the profile reclaim it', async () => {
    const broker = new MockSignalingBroker();
    const rtc = new MockRtcNetwork();
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'takeover-host' },
      {
        signaling: broker.signaling('takeover-host-peer'),
        peerConnection: rtc.factory('takeover-host'),
        seed: 121,
        heartbeatIntervalMs: 10,
        heartbeatTimeoutMs: 60,
      },
    );
    const guest = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'takeover-guest' },
      {
        signaling: broker.signaling('takeover-guest-peer'),
        peerConnection: rtc.factory('takeover-guest'),
        seed: 7,
      },
    );
    sessions.push(host, guest);

    const room = await host.create({ seats: 2 });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1));

    host.send('draw.stock');
    await eventually(() =>
      expect(blitzMultiplayerSession(host.getSnapshot())?.log).toHaveLength(1),
    );
    const drawn = blitzMultiplayerSession(host.getSnapshot())!;
    const discard = drawn.def.flow
      .legalMoves(drawn.state, drawn.phase)
      .find((move) => move.id === 'discard');
    expect(discard).toBeDefined();
    host.send(discard!.id, discard!.payload);
    await eventually(() =>
      expect(blitzMultiplayerSession(host.getSnapshot())?.phase.actor).toBe(1),
    );
    const beforeDrop = blitzMultiplayerSession(host.getSnapshot())!.log.length;

    guest.close();
    await eventually(
      () => {
        expect(host.getSnapshot().seats.find((seat) => seat.seat === 1)).toMatchObject({
          connected: false,
          bot: true,
        });
        expect(blitzMultiplayerSession(host.getSnapshot())!.log.length).toBeGreaterThan(beforeDrop);
      },
      100,
      10,
    );

    const rejoined = new MultiplayerRoomSession(
      { name: 'Guest', avatarId: 'mint', profileId: 'takeover-guest' },
      {
        signaling: broker.signaling('takeover-guest-rejoined'),
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
          profileId: 'takeover-guest',
        });
        expect(rejoined.getSnapshot().localSeat).toBe(1);
      },
      100,
      10,
    );
  });

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

    const hostRound = cribbageMultiplayerSession(host.getSnapshot())!;
    const hostDiscard = hostRound.def.flow.legalMovesFor!(hostRound.state, hostRound.phase, 0).find(
      (move) => move.id === 'crib.discard',
    )!;
    host.send(hostDiscard.id, hostDiscard.payload);
    await eventually(() => {
      expect(cribbageMultiplayerSession(host.getSnapshot())?.log).toHaveLength(1);
      expect(cribbageMultiplayerSession(guest.getSnapshot())?.log).toHaveLength(1);
    });

    const guestRound = cribbageMultiplayerSession(guest.getSnapshot())!;
    const guestDiscard = guestRound.def.flow.legalMovesFor!(
      guestRound.state,
      guestRound.phase,
      1,
    ).find((move) => move.id === 'crib.discard')!;
    guest.send(guestDiscard.id, guestDiscard.payload);
    await eventually(() => {
      expect(cribbageMultiplayerSession(host.getSnapshot())?.log).toHaveLength(2);
      expect(cribbageMultiplayerSession(guest.getSnapshot())?.log).toHaveLength(2);
    });

    const hostSession = cribbageMultiplayerSession(host.getSnapshot())!;
    const guestSession = cribbageMultiplayerSession(guest.getSnapshot())!;
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
      'Cribbage rooms require exactly two seats',
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
    expect(presidentMultiplayerSession(host.session.getSnapshot())!.state.hands.flat().length).toBe(
      52,
    );

    // Drive real turns through the mesh; after every event every peer must
    // hold the same log length AND the same state hash.
    for (let step = 0; step < 14; step++) {
      const hostSession = presidentMultiplayerSession(host.session.getSnapshot());
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
          (peer) => presidentMultiplayerSession(peer.session.getSnapshot())!.log.length,
        );
        expect(Math.min(...lengths)).toBeGreaterThan(baseline);
        expect(new Set(lengths).size).toBe(1);
      });
      const hashes = peers.map((peer) =>
        stateHash(presidentMultiplayerSession(peer.session.getSnapshot())!.state),
      );
      expect(new Set(hashes).size).toBe(1);
    }

    // The guests replay the authority log from the announced seed — the whole
    // replayed log must hash-match the host's event for event.
    const hostLog = presidentMultiplayerSession(host.session.getSnapshot())!.log;
    for (const peer of peers.slice(1)) {
      const guestLog = presidentMultiplayerSession(peer.session.getSnapshot())!.log;
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
    await expect(host.create({ gameId: 'president', seats: 3 })).rejects.toThrow(/4–8 seats/);
    await expect(host.create({ gameId: 'president', seats: 9 })).rejects.toThrow(/4–8 seats/);
    // blitz keeps its own 2–4 ring
    await expect(host.create({ gameId: 'blitz', seats: 6 })).rejects.toThrow(/2–4 seats/);
  });
});
