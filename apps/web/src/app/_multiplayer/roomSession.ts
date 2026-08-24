'use client';

import { createSession, type FxEvent, type GameSession, type RuleValues } from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import {
  presidentConfig,
  presidentGame,
  type PresidentRules,
  type PresidentState,
} from '@parlour/game-president';
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
  type RoomSecurity,
  type RoomSettings,
} from '@/lib/multiplayer';
import { resolveVeiledState, stateContainsCardId } from '@parlour/engine';
import {
  auditSummary,
  recoveryPolicyFor,
  VeilRoom,
  VeilSession,
  type RecoveryPolicy,
  type VeilAuditState,
} from '@/lib/multiplayer/veil';
import { NostrSignaling, type RoomAnnouncement } from '@/lib/multiplayer/NostrSignaling';
import { validateRoomCode } from '@/lib/rooms/code';
import { hasValidSeatCount, seatRangeFor } from '@/lib/rooms/seatRange';

export type MultiplayerGameId = 'blitz' | 'wildpile' | 'president';

/** What the room badge shows about privacy — see lib/multiplayer/veil. */
export type MultiplayerSecurity = {
  tier: RoomSecurity;
  audit: VeilAuditState;
  label: string;
  detail: string;
  recovery: RecoveryPolicy;
  /** ceremony layers laid so far, of `seats` */
  ceremony: { laid: number; seats: number; ready: boolean };
};
export type MultiplayerGameSession =
  | GameSession<BlitzState, BlitzConfig>
  | GameSession<WildpileState, WildpileRules>
  | GameSession<PresidentState, PresidentRules>;

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
  security: MultiplayerSecurity;
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
  /**
   * `open` (the default) is fast and gives every peer the whole game state.
   * `veil` hides hands from every peer at the cost of a shuffle ceremony and a
   * real disconnect trade-off.
   */
  security?: RoomSecurity;
};

function securityFor(
  tier: RoomSecurity,
  seats: number,
  audit: VeilAuditState,
): MultiplayerSecurity {
  const summary = auditSummary(audit);
  return {
    tier,
    audit,
    label: summary.label,
    detail: summary.detail,
    recovery: recoveryPolicyFor(seats),
    ceremony: { laid: 0, seats, ready: tier === 'open' },
  };
}

export class MultiplayerRoomSession {
  private readonly listeners = new Set<Listener>();
  private authority: SessionAuthority | null = null;
  private transport: P2PTransport | null = null;
  private veil: { session: VeilSession; room: VeilRoom } | null = null;
  private seed = 0;
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
    security: securityFor('open', 2, 'open'),
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
    const gameId = options.gameId ?? 'blitz';
    if (!hasValidSeatCount(gameId, options.seats)) {
      const { min, max } = seatRangeFor(gameId);
      throw new Error(`rooms require ${min}–${max} seats for ${gameId}`);
    }
    const settings = resolveRoomSettings({
      gameId: options.gameId ?? 'blitz',
      seats: options.seats,
      config: options.config ?? {},
      security: options.security ?? 'open',
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

  async start(): Promise<void> {
    if (!this.snapshot.isHost) throw new Error('only the host can start the match');
    if (this.snapshot.seats.length < (this.snapshot.settings?.seats ?? 2)) {
      throw new Error('every seat must be filled before the match starts');
    }
    if (this.snapshot.security.tier === 'veil') await this.dealVeiled();
    this.update({ stage: 'table' });
  }

  /**
   * Runs the shuffle ceremony, opens the setup cards the game needs face up,
   * and swaps the lobby's placeholder deal for the real veiled one. Nothing is
   * dealt for real until every seat has laid a layer, which is why this cannot
   * happen at room creation: the table has to be full first.
   */
  private async dealVeiled(): Promise<void> {
    const veil = this.veil;
    const settings = this.snapshot.settings;
    if (!veil || !settings || !this.transport) throw new Error('the veiled room is not ready');
    const support = gameDefFor(settings).veil;
    if (!support) throw new Error(`${settings.gameId} cannot run a veiled room`);

    await veil.room.publishHeader(support.deck(settings.config).cardIds);
    for (let seat = 0; seat < settings.seats; seat++) {
      await veil.room.advanceCeremony();
      this.publishCeremonyProgress();
      await waitForCeremonySeat(veil.session, seat + 1, settings.seats);
    }

    // Open the cards the game starts face up (Blitz's discard, Wild's starter).
    const from = veil.session.publicSetupPositions(support, 0);
    const opened: string[] = [];
    for (let step = 0; step < 8 && !veil.session.publicSetupSatisfied(support, opened); step++) {
      opened.push(await veil.room.open(0, from + step, 'public'));
    }
    const plan = veil.session.dealPlan(support, opened);

    const runtime = createRoomRuntime(
      settings,
      this.seed,
      (seat, bot) => this.acceptSeatBot(seat, bot),
      plan.deckOrder,
    );
    this.authority!.importSnapshot(runtime.authority.exportSnapshot());
    this.transport.publishSnapshot();
    this.update({
      session: this.presented(this.authority!.getSession()),
      fx: runtime.session.setupFx ?? [],
      fxKey: this.snapshot.fxKey + 1,
      security: {
        ...this.snapshot.security,
        ceremony: { laid: settings.seats, seats: settings.seats, ready: true },
      },
    });
    void this.openMyHandles();
  }

  /** Builds this seat's Veil state and points it at the mesh. */
  private attachVeil(settings: RoomSettings, seed: number): void {
    const transport = this.transport;
    if (!transport) return;
    const session = new VeilSession({
      roomCode: this.snapshot.room?.code ?? 'ROOM',
      seed,
      seat: this.snapshot.localSeat ?? 0,
      seats: settings.seats,
      gameId: settings.gameId,
      config: settings.config,
    });
    const room = new VeilRoom(
      session,
      {
        send: (message, to) => transport.sendVeil(message, to),
        peerIdForSeat: (seat) => transport.peerIdForSeat(seat),
        seatForPeer: (peerId) => transport.seatForPeerId(peerId),
      },
      settings.seats,
    );
    transport.onVeil((peerId, message) => {
      void room.receive(peerId, message).catch((error: unknown) => {
        this.update({
          error: error instanceof Error ? error.message : 'A Veil message was rejected',
        });
      });
    });
    this.veil = { session, room };
    void room.announce();
  }

  private publishCeremonyProgress(): void {
    const progress = this.veil?.session.progress(0);
    if (!progress) return;
    this.update({
      security: {
        ...this.snapshot.security,
        ceremony: { laid: progress.laid, seats: progress.seats, ready: progress.ready },
      },
    });
  }

  /**
   * Sends a move. In a veiled room the UI works in real card ids (it renders
   * this seat's resolved view), so any card the move makes public is turned
   * back into the `[handle, card]` opening the engine needs. `reveals` names
   * extra handles for moves that open a whole hand, like a blitz claim.
   */
  send(move: string, payload?: unknown, reveals?: readonly string[]): void {
    if (!this.transport || this.snapshot.localSeat === null) {
      throw new Error('your seat is not connected');
    }
    this.transport.send({
      id: `${this.profile.profileId}:${this.sequence++}`,
      seat: this.snapshot.localSeat,
      move,
      payload,
      ...this.openingsFor(payload, reveals),
    });
  }

  /**
   * The openings a move needs: the card named in its payload, plus any extra
   * cards the caller asked to open. Handles the table can already read are
   * skipped — opening a card twice is rejected by the engine.
   */
  private openingsFor(
    payload: unknown,
    extra?: readonly string[],
  ): { reveals?: readonly (readonly [string, string])[] } {
    const veil = this.veil;
    const state = this.snapshot.session?.state;
    if (!veil || !state) return {};
    const wanted = new Set<string>(extra ?? []);
    const named = (payload as { card?: unknown } | null | undefined)?.card;
    if (typeof named === 'string') wanted.add(named);
    if (wanted.size === 0) return {};

    const byCard = new Map<string, string>();
    for (const [handle, card] of veil.session.knownFaces()) byCard.set(card, handle);
    const reveals: (readonly [string, string])[] = [];
    for (const card of wanted) {
      const handle = byCard.get(card);
      if (handle && stateHolds(state, handle)) reveals.push([handle, card]);
    }
    return reveals.length > 0 ? { reveals } : {};
  }

  /**
   * The session the UI renders: the authority's shared state with this seat's
   * own faces overlaid. The authority keeps the veiled truth; this is only the
   * view, so every screen and every legal-move enumeration works on real cards
   * without a single component knowing Veil exists.
   */
  /**
   * Peels this seat's own cards after a veiled deal, and after any draw that
   * hands it a fresh handle. Each one is a chain of `seats - 1` hops, so they
   * run concurrently and the view refreshes as they land rather than blocking
   * the table on the slowest.
   */
  private async openMyHandles(): Promise<void> {
    const veil = this.veil;
    const seat = this.snapshot.localSeat;
    const state = this.authority?.getSession().state as { hands?: unknown } | undefined;
    if (!veil || seat === null || !state) return;
    const mine = Array.isArray(state.hands) ? (state.hands[seat] as unknown) : null;
    if (!Array.isArray(mine)) return;

    const wanted = mine.filter(
      (card): card is string => typeof card === 'string' && !veil.session.knownFaces().has(card),
    );
    await Promise.all(
      wanted.map(async (handle) => {
        const at = veil.session.positionFor(handle);
        if (!at) return;
        try {
          await veil.room.open(at.epoch, at.position, 'private');
          this.refreshView();
        } catch (error) {
          this.update({
            error: error instanceof Error ? error.message : 'A card could not be opened',
          });
        }
      }),
    );
  }

  /** Re-presents the authority's state now that this seat knows more faces. */
  private refreshView(): void {
    if (!this.authority) return;
    this.update({ session: this.presented(this.authority.getSession()) });
  }

  private presented(session: MultiplayerGameSession): MultiplayerGameSession {
    const known = this.veil?.session.knownFaces();
    if (!known || known.size === 0) return session;
    return {
      ...session,
      state: resolveVeiledState(session.state, known),
    } as MultiplayerGameSession;
  }

  /** Faces this seat may render. Empty in an open room, where nothing is hidden. */
  knownFaces(): ReadonlyMap<string, string> {
    return this.veil?.session.knownFaces() ?? new Map();
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
    const seed = this.dependencies.seed ?? randomSeed();
    this.seed = seed;
    const runtime = createRoomRuntime(settings, seed, (seat, bot) => this.acceptSeatBot(seat, bot));
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
    this.transport.onSnapshot(() => {
      // The host published the opening position (a veiled deal), so adopt it.
      this.update({
        session: this.presented(this.authority!.getSession()),
        fx: this.authority!.getSession().setupFx ?? [],
        fxKey: this.snapshot.fxKey + 1,
        stage: 'table',
      });
      void this.openMyHandles();
    });
    if (settings.security === 'veil') this.attachVeil(settings, seed);
    const tier: RoomSecurity = settings.security ?? 'open';
    this.update({
      gameId: settings.gameId as MultiplayerGameId,
      settings,
      session: runtime.session,
      fx: runtime.session.setupFx ?? [],
      fxKey: 0,
      error: null,
      security: securityFor(tier, settings.seats, tier === 'veil' ? 'veiled' : 'open'),
    });
  }

  private accept(packet: AppliedPacket): void {
    this.update({
      session: this.presented(this.authority!.getSession()),
      fx: packet.fx,
      fxKey: this.snapshot.fxKey + 1,
      error: null,
      stage: 'table',
    });
    // A draw may have handed this seat a handle it cannot read yet.
    if (this.veil) void this.openMyHandles();
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
      const authoritativeSession = this.presented(this.authority!.getSession());
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

export function presidentMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<PresidentState, PresidentRules> | null {
  return snapshot.gameId === 'president'
    ? (snapshot.session as GameSession<PresidentState, PresidentRules> | null)
    : null;
}

function stateHolds(state: unknown, handle: string): boolean {
  return stateContainsCardId(state, handle);
}

/** The game pack a room's settings name. */
function gameDefFor(settings: RoomSettings) {
  if (settings.gameId === 'wildpile') return wildpileGame;
  if (settings.gameId === 'president') return presidentGame;
  return createBlitzDef();
}

/**
 * Waits for the ceremony to reach `laid` layers. Peers publish their layers
 * over the mesh, so the host has to let those land before laying the next one.
 */
async function waitForCeremonySeat(
  session: VeilSession,
  laid: number,
  seats: number,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    const progress = session.progress(0);
    if (progress.laid >= laid || progress.laid >= seats) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the shuffle ceremony stalled — a seat never published its layer');
}

function resolveRoomSettings(settings: RoomSettings): RoomSettings {
  if (!hasValidSeatCount(settings.gameId, settings.seats)) {
    const { min, max } = seatRangeFor(settings.gameId);
    throw new Error(`rooms require ${min}–${max} seats for ${settings.gameId}`);
  }
  const security: RoomSecurity = settings.security === 'veil' ? 'veil' : 'open';
  if (settings.gameId === 'blitz') {
    return {
      gameId: 'blitz',
      seats: settings.seats,
      config: blitzConfigSchema.resolve(settings.config as Partial<BlitzConfig>),
      security,
    };
  }
  if (settings.gameId === 'wildpile') {
    return {
      gameId: 'wildpile',
      seats: settings.seats,
      config: wildpileConfig.resolve(settings.config as Partial<WildpileRules>),
      security,
    };
  }
  if (settings.gameId === 'president') {
    return {
      gameId: 'president',
      seats: settings.seats,
      config: presidentConfig.resolve(settings.config as Partial<PresidentRules>),
      security,
    };
  }
  throw new Error(`unsupported room game: ${settings.gameId}`);
}

function createRoomRuntime(
  settings: RoomSettings,
  seed: number,
  onSeatBot: (seat: number, bot: boolean) => void,
  deckOrder?: readonly string[],
): { session: MultiplayerGameSession; authority: SessionAuthority } {
  // A veiled deal needs the ceremony order, and the ceremony cannot run until
  // every seat is present. Until then the room sits on an ordinary lobby deal
  // that is never played and is marked `open`, so a joining peer can replay the
  // snapshot instead of choking on a veiled one with no deck order.
  const veiled = settings.security === 'veil' && deckOrder !== undefined;
  const veil = veiled ? { veiled: true, deckOrder } : {};
  const runtimeSettings: RoomSettings = veiled ? settings : { ...settings, security: 'open' };
  const seatsRange = seatRangeFor(settings.gameId);
  const common = { settings: runtimeSettings, onSeatBot, seatsRange };
  if (settings.gameId === 'wildpile') {
    const config = settings.config as WildpileRules;
    const session = createSession(wildpileGame, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def: wildpileGame, session, ...common });
    return { session, authority };
  }

  if (settings.gameId === 'president') {
    const config = settings.config as PresidentRules;
    const session = createSession(presidentGame, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def: presidentGame, session, ...common });
    return { session, authority };
  }

  const def = createBlitzDef();
  const config = settings.config as BlitzConfig;
  const session = createSession(def, { seed, config, seats: settings.seats, ...veil });
  const authority = new EngineAuthority({ def, session, ...common });
  return { session, authority };
}
