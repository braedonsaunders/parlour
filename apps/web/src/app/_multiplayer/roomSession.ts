'use client';

import { createSession, type FxEvent, type GameSession, type RuleValues } from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import {
  wildpileConfig,
  wildpileGame,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import {
  EngineAuthority,
  P2PTransport,
  type AppliedPacket,
  type AuthorityAdapter,
  type PresenceEvent,
  type RoomHandle,
  type RoomSettings,
} from '@/lib/multiplayer';
import { NostrSignaling, type RoomAnnouncement } from '@/lib/multiplayer/NostrSignaling';
import { validateRoomCode } from '@/lib/rooms/code';

export type MultiplayerGameId = 'blitz' | 'wildpile';
export type MultiplayerGameSession =
  GameSession<BlitzState, BlitzConfig> | GameSession<WildpileState, WildpileRules>;

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
  gameId: MultiplayerGameId | null;
  settings: RoomSettings | null;
  session: MultiplayerGameSession | null;
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

type SessionAuthority = AuthorityAdapter & {
  getSession(): MultiplayerGameSession;
};

type CreateRoomOptions = {
  seats: number;
  gameId?: MultiplayerGameId;
  config?: RuleValues;
};

export class MultiplayerRoomSession {
  private readonly listeners = new Set<Listener>();
  private authority: SessionAuthority | null = null;
  private transport: P2PTransport | null = null;
  private sequence = 0;
  private snapshot: MultiplayerRoomSnapshot = {
    room: null,
    gameId: null,
    settings: null,
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

  async create(options: CreateRoomOptions): Promise<RoomHandle> {
    if (options.seats < 2 || options.seats > 4) throw new Error('rooms require 2–4 seats');
    const settings = resolveRoomSettings({
      gameId: options.gameId ?? 'blitz',
      seats: options.seats,
      config: options.config ?? {},
    });
    this.prepare(settings);
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
    this.update({ connection: 'connecting' });
    const verdict = validateRoomCode(code);
    if (!verdict.ok) throw new Error('Room codes use four unambiguous letters or digits');
    const signaling = this.dependencies.signaling ?? new NostrSignaling();
    let announcement: RoomAnnouncement | null = null;
    try {
      announcement = await signaling.resolve(verdict.code);
      const settings = resolveRoomSettings(announcement.settings);
      this.prepare(settings, signaling);
      const room = await this.transport!.join(verdict.code, announcement);
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
      if (!this.transport) signaling.close();
      this.fail(error, `Table ${code} isn't answering. Check the code and try again.`);
      throw error;
    }
  }

  start(): void {
    if (!this.snapshot.isHost) throw new Error('only the host can start the match');
    if (this.snapshot.seats.length < (this.snapshot.settings?.seats ?? 2)) {
      throw new Error('every seat must be filled before the match starts');
    }
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

  inject(move: string, payload?: unknown): void {
    if (!this.transport) throw new Error('the room is not connected');
    this.transport.inject(move, payload);
  }

  close(): void {
    this.transport?.close();
    this.transport = null;
    this.update({ connection: 'closed' });
  }

  private prepare(settings: RoomSettings, signaling?: NostrSignaling): void {
    if (this.transport) throw new Error('this session already has an active room');
    const runtime = createRoomRuntime(
      settings,
      this.dependencies.seed ?? randomSeed(),
      (seat, bot) => this.acceptSeatBot(seat, bot),
    );
    this.authority = runtime.authority;
    this.transport = new P2PTransport({
      authority: this.authority,
      profileId: this.profile.profileId,
      profileName: this.profile.name,
      profileAvatarId: this.profile.avatarId,
      signaling: signaling ?? this.dependencies.signaling,
      peerConnection: this.dependencies.peerConnection,
    });
    this.transport.onEvent((packet) => this.accept(packet));
    this.transport.onPresence((presence) => this.acceptPresence(presence));
    this.update({
      gameId: settings.gameId as MultiplayerGameId,
      settings,
      session: runtime.session,
      fx: runtime.session.setupFx ?? [],
      fxKey: 0,
      error: null,
    });
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
    if (presence.kind === 'host.changed') {
      this.update({
        isHost: presence.hostId === this.snapshot.room?.peerId,
        room: this.snapshot.room
          ? { ...this.snapshot.room, hostId: presence.hostId }
          : this.snapshot.room,
      });
      return;
    }
    if (presence.kind === 'peer.joined' || presence.kind === 'seat.reclaimed') {
      const isLocal = presence.peerId === this.snapshot.room?.peerId;
      const existing = this.snapshot.seats.filter((seat) => seat.seat !== presence.seat);
      const joined: MultiplayerSeat = isLocal
        ? { ...this.profile, seat: presence.seat, connected: true, bot: false }
        : {
            ...presence.profile,
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

  private acceptSeatBot(seat: number, bot: boolean): void {
    this.update({
      seats: this.snapshot.seats.map((player) =>
        player.seat === seat ? { ...player, bot, connected: !bot } : player,
      ),
    });
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

export function blitzMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<BlitzState, BlitzConfig> | null {
  return snapshot.gameId === 'blitz'
    ? (snapshot.session as GameSession<BlitzState, BlitzConfig> | null)
    : null;
}

export function wildMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<WildpileState, WildpileRules> | null {
  return snapshot.gameId === 'wildpile'
    ? (snapshot.session as GameSession<WildpileState, WildpileRules> | null)
    : null;
}

function resolveRoomSettings(settings: RoomSettings): RoomSettings {
  if (!Number.isInteger(settings.seats) || settings.seats < 2 || settings.seats > 4) {
    throw new Error('rooms require 2–4 seats');
  }
  if (settings.gameId === 'blitz') {
    return {
      gameId: 'blitz',
      seats: settings.seats,
      config: blitzConfigSchema.resolve(settings.config as Partial<BlitzConfig>),
    };
  }
  if (settings.gameId === 'wildpile') {
    return {
      gameId: 'wildpile',
      seats: settings.seats,
      config: wildpileConfig.resolve(settings.config as Partial<WildpileRules>),
    };
  }
  throw new Error(`unsupported room game: ${settings.gameId}`);
}

function createRoomRuntime(
  settings: RoomSettings,
  seed: number,
  onSeatBot: (seat: number, bot: boolean) => void,
): { session: MultiplayerGameSession; authority: SessionAuthority } {
  if (settings.gameId === 'wildpile') {
    const config = settings.config as WildpileRules;
    const session = createSession(wildpileGame, { seed, config, seats: settings.seats });
    const authority = new EngineAuthority({
      def: wildpileGame,
      session,
      settings,
      onSeatBot,
    });
    return { session, authority };
  }

  const def = createBlitzDef();
  const config = settings.config as BlitzConfig;
  const session = createSession(def, { seed, config, seats: settings.seats });
  const authority = new EngineAuthority({ def, session, settings, onSeatBot });
  return { session, authority };
}
