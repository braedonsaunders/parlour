'use client';

import { createSession, type FxEvent, type GameSession } from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import {
  EngineAuthority,
  P2PTransport,
  type AppliedPacket,
  type PresenceEvent,
  type RoomHandle,
} from '@/lib/multiplayer';
import type { NostrSignaling } from '@/lib/multiplayer/NostrSignaling';

export type MultiplayerProfile = {
  name: string;
  avatarId: string;
  profileId: string;
};

export type MultiplayerSeat = MultiplayerProfile & {
  seat: number;
  connected: boolean;
  bot: boolean;
};

export type MultiplayerRoomSnapshot = {
  room: RoomHandle | null;
  session: GameSession<BlitzState, BlitzConfig> | null;
  localSeat: number | null;
  seats: readonly MultiplayerSeat[];
  connection: 'connecting' | 'connected' | 'reconnecting' | 'closed';
  stage: 'lobby' | 'table';
  fx: readonly FxEvent[];
  fxKey: number;
  error: string | null;
  isHost: boolean;
};

type SessionDependencies = {
  signaling?: NostrSignaling;
  peerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
  seed?: number;
};

type Listener = () => void;

const def = createBlitzDef();

export class MultiplayerRoomSession {
  private readonly listeners = new Set<Listener>();
  private authority: EngineAuthority<BlitzState, BlitzConfig> | null = null;
  private transport: P2PTransport | null = null;
  private sequence = 0;
  private snapshot: MultiplayerRoomSnapshot = {
    room: null,
    session: null,
    localSeat: null,
    seats: [],
    connection: 'connecting',
    stage: 'lobby',
    fx: [],
    fxKey: 0,
    error: null,
    isHost: false,
  };

  constructor(
    private readonly profile: MultiplayerProfile,
    private readonly dependencies: SessionDependencies = {},
  ) {}

  getSnapshot = (): MultiplayerRoomSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async create(options: { seats: number }): Promise<RoomHandle> {
    if (options.seats < 2 || options.seats > 4) throw new Error('rooms require 2–4 seats');
    this.prepare(options.seats);
    const settings = {
      gameId: def.id,
      seats: options.seats,
      config: blitzConfigSchema.defaults(),
    };
    try {
      const room = await this.transport!.create(settings);
      this.update({
        room,
        localSeat: 0,
        seats: [{ ...this.profile, seat: 0, connected: true, bot: false }],
        connection: 'connected',
        isHost: true,
      });
      return room;
    } catch (error) {
      this.fail(error, 'Could not create the room. Check your connection and try again.');
      throw error;
    }
  }

  async join(code: string): Promise<RoomHandle> {
    this.prepare(4);
    this.update({ connection: 'connecting' });
    try {
      const room = await this.transport!.join(code);
      this.update({
        room,
        seats: [
          {
            name: 'Host',
            avatarId: 'ember',
            profileId: room.hostId,
            seat: 0,
            connected: true,
            bot: false,
          },
        ],
      });
      return room;
    } catch (error) {
      this.fail(error, `Table ${code} isn't answering. Check the code and try again.`);
      throw error;
    }
  }

  start(): void {
    if (!this.snapshot.isHost) throw new Error('only the host can start the match');
    if (this.snapshot.seats.length < 2) throw new Error('at least two players must be seated');
    this.update({ stage: 'table' });
  }

  send(move: string, payload?: unknown): void {
    if (!this.transport || this.snapshot.localSeat === null) {
      throw new Error('your seat is not connected');
    }
    this.transport.send({
      id: `${this.profile.profileId}:${this.sequence++}`,
      seat: this.snapshot.localSeat,
      move,
      payload,
    });
  }

  close(): void {
    this.transport?.close();
    this.transport = null;
    this.update({ connection: 'closed' });
  }

  private prepare(seats: number): void {
    if (this.transport) throw new Error('this session already has an active room');
    const session = createSession(def, {
      seed: this.dependencies.seed ?? randomSeed(),
      config: blitzConfigSchema.defaults(),
      seats,
    });
    this.authority = new EngineAuthority({
      def,
      session,
      settings: { gameId: def.id, seats, config: blitzConfigSchema.defaults() },
    });
    this.transport = new P2PTransport({
      authority: this.authority,
      profileId: this.profile.profileId,
      signaling: this.dependencies.signaling,
      peerConnection: this.dependencies.peerConnection,
    });
    this.transport.onEvent((packet) => this.accept(packet));
    this.transport.onPresence((presence) => this.acceptPresence(presence));
    this.update({ session, fx: session.setupFx ?? [], fxKey: 0, error: null });
  }

  private accept(packet: AppliedPacket): void {
    this.update({
      session: this.authority!.getSession(),
      fx: packet.fx,
      fxKey: this.snapshot.fxKey + 1,
      error: null,
      stage: 'table',
    });
  }

  private acceptPresence(presence: PresenceEvent): void {
    if (presence.kind === 'connection') {
      this.update({ connection: presence.state });
      return;
    }
    if (presence.kind === 'error') {
      this.update({ error: presence.message });
      return;
    }
    if (presence.kind === 'peer.joined' || presence.kind === 'seat.reclaimed') {
      const isLocal = presence.peerId === this.snapshot.room?.peerId;
      const existing = this.snapshot.seats.filter((seat) => seat.seat !== presence.seat);
      const joined: MultiplayerSeat = isLocal
        ? { ...this.profile, seat: presence.seat, connected: true, bot: false }
        : {
            name: `Friend ${presence.seat + 1}`,
            avatarId: 'cobalt',
            profileId: presence.peerId,
            seat: presence.seat,
            connected: true,
            bot: false,
          };
      const authoritativeSession = this.authority!.getSession();
      this.update({
        localSeat: isLocal ? presence.seat : this.snapshot.localSeat,
        seats: [...existing, joined].sort((a, b) => a.seat - b.seat),
        session: authoritativeSession,
        fx:
          isLocal && !this.snapshot.isHost
            ? (authoritativeSession.setupFx ?? [])
            : this.snapshot.fx,
        connection: 'connected',
        stage: isLocal && !this.snapshot.isHost ? 'table' : this.snapshot.stage,
      });
      return;
    }
    if (presence.kind === 'peer.left') {
      this.update({
        seats: this.snapshot.seats.map((seat) =>
          seat.seat === presence.seat ? { ...seat, connected: false, bot: true } : seat,
        ),
      });
    }
  }

  private fail(_error: unknown, fallback: string): void {
    this.update({ error: fallback });
  }

  private update(patch: Partial<MultiplayerRoomSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

let activeSession: MultiplayerRoomSession | null = null;
const activeListeners = new Set<Listener>();

export function activateMultiplayerSession(session: MultiplayerRoomSession): void {
  if (activeSession && activeSession !== session) activeSession.close();
  activeSession = session;
  for (const listener of activeListeners) listener();
}

export function getActiveMultiplayerSession(): MultiplayerRoomSession | null {
  return activeSession;
}

export function subscribeActiveMultiplayerSession(listener: Listener): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

export function clearActiveMultiplayerSession(): void {
  activeSession = null;
  for (const listener of activeListeners) listener();
}

export function multiplayerProfile(name: string, avatarId: string): MultiplayerProfile {
  const storageKey = 'parlour.multiplayer.profile-id';
  let profileId = window.localStorage.getItem(storageKey);
  if (!profileId) {
    profileId = crypto.randomUUID();
    window.localStorage.setItem(storageKey, profileId);
  }
  return { name: name || 'Player', avatarId, profileId };
}

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! | 0;
}
