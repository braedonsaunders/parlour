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
import { wildpileConfig, type WildpileRules, type WildpileState } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineAuthority } from '@/lib/multiplayer';
import { NostrSignaling, type SignalPayload } from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';
import { multiplayerSession, MultiplayerRoomSession } from './roomSession';

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
        const hostState = multiplayerSession<BlitzState, BlitzConfig>(
          host.getSnapshot(),
          'blitz',
        )!.state;
        const guestState = multiplayerSession<BlitzState, BlitzConfig>(
          guest.getSnapshot(),
          'blitz',
        )!.state;
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
        expect(
          multiplayerSession<BlitzState, BlitzConfig>(host.getSnapshot(), 'blitz')!.log.length,
        ).toBeGreaterThan(beforeDrop);
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
    await expect(host.create({ gameId: 'president', seats: 3 })).rejects.toThrow(/4–8 seats/);
    await expect(host.create({ gameId: 'president', seats: 9 })).rejects.toThrow(/4–8 seats/);
    // blitz keeps its own 2–4 ring
    await expect(host.create({ gameId: 'blitz', seats: 6 })).rejects.toThrow(/2–4 seats/);
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
    await expect(host.create({ gameId: 'spades', seats: 3 })).rejects.toThrow(/4–4 seats/);
    await expect(host.create({ gameId: 'spades', seats: 5 })).rejects.toThrow(/4–4 seats/);
    await expect(host.create({ gameId: 'spades', seats: 2 })).rejects.toThrow(/4–4 seats/);
  });

  // Engine v1 Veil is gone. Saying so out loud beats quietly downgrading a
  // player who explicitly asked for cryptographic play.
  it('refuses a veiled spades room in plain words instead of silently opening it', async () => {
    const host = new MultiplayerRoomSession(
      { name: 'Host', avatarId: 'ember', profileId: 'spades-veil' },
      { seed: 3 },
    );
    sessions.push(host);
    await expect(host.create({ gameId: 'spades', seats: 4, security: 'veil' })).rejects.toThrow(
      /veiled Spades is not available/,
    );
  });

  it('resolves an open spades room as open, with the pack defaults filled in', async () => {
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
    expect(settings.security).toBe('open');
    expect(settings.seats).toBe(4);
    expect(settings.config).toMatchObject({ targetScore: 500, nil: true, bags: true });
  });
});
