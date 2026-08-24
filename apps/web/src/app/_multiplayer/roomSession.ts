'use client';

import {
  createSession,
  isVeilHandle,
  isActingSeat,
  type CardRecycle,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type RuleValues,
} from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import {
  createEuchreDef,
  euchreConfig,
  type EuchreRules,
  type EuchreState,
} from '@parlour/game-euchre';
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
  ratscrewConfigSchema,
  ratscrewGame,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import {
  cribbageConfigSchema,
  createCribbageDef,
  type CribbageConfig,
  type CribbageState,
} from '@parlour/game-cribbage';
import {
  heartsConfigSchema,
  heartsGame,
  type HeartsRules,
  type HeartsState,
} from '@parlour/game-hearts';
import {
  createGinMatchDef,
  ginConfigSchema,
  type GinConfig,
  type GinMatchState,
} from '@parlour/game-gin';
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
import { botTurnKey, botTurns } from './botSeats';
import { NostrSignaling, type RoomAnnouncement } from '@/lib/multiplayer/NostrSignaling';
import { validateRoomCode } from '@/lib/rooms/code';
import { hasValidSeatCount, seatRangeFor } from '@/lib/rooms/seatRange';

export type MultiplayerGameId =
  'blitz' | 'cribbage' | 'wildpile' | 'ratscrew' | 'euchre' | 'hearts' | 'gin' | 'president';

/** What the room badge shows about privacy — see lib/multiplayer/veil. */
export type MultiplayerSecurity = {
  tier: RoomSecurity;
  audit: VeilAuditState;
  label: string;
  detail: string;
  recovery: RecoveryPolicy;
  /** ceremony layers laid so far, of `seats` */
  ceremony: { laid: number; seats: number; ready: boolean };
  /**
   * Seats whose layer this client rebuilt after they disconnected. Their cards
   * are readable from here on, so the badge names them rather than letting the
   * loss pass quietly.
   */
  recoveredSeats: readonly number[];
  /** set when a seat left and its layer cannot be recovered — the round stops */
  paused: string | null;
};
export type MultiplayerGameSession =
  | GameSession<BlitzState, BlitzConfig>
  | GameSession<CribbageState, CribbageConfig>
  | GameSession<WildpileState, WildpileRules>
  | GameSession<RatscrewState, RatscrewConfig>
  | GameSession<EuchreState, EuchreRules>
  | GameSession<HeartsState, HeartsRules>
  | GameSession<GinMatchState, GinConfig>
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
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
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
    recoveredSeats: [],
    paused: null,
  };
}

export class MultiplayerRoomSession {
  private readonly listeners = new Set<Listener>();
  private authority: SessionAuthority | null = null;
  private transport: P2PTransport | null = null;
  private veil: { session: VeilSession; room: VeilRoom } | null = null;
  /** Ordered DataChannel delivery still needs ordered async crypto completion. */
  private veilInbox: Promise<void> = Promise.resolve();
  private seed = 0;
  private sequence = 0;
  private recycleActionPending = false;
  /** bot turns already scheduled, keyed by log position, so none fires twice */
  private readonly scheduledBotTurns = new Set<string>();
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
      if (settings.security === 'veil') this.attachVeil(settings, this.seed);
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
      const assignedSeat = this.transport!.seatForPeerId(room.peerId);
      const knownSeats = this.snapshot.seats.filter(
        (seat) => seat.seat !== 0 && seat.seat !== assignedSeat,
      );
      const joinedSeats: MultiplayerSeat[] = [
        {
          name: 'Host',
          avatarId: 'ember',
          profileId: room.hostId,
          seat: 0,
          connected: true,
          bot: false,
        },
        ...knownSeats,
      ];
      if (assignedSeat !== null) {
        joinedSeats.push({ ...this.profile, seat: assignedSeat, connected: true, bot: false });
      }
      this.update({
        room,
        localSeat: assignedSeat ?? this.snapshot.localSeat,
        seats: joinedSeats.sort((a, b) => a.seat - b.seat),
      });
      if (settings.security === 'veil' && assignedSeat !== null && !this.veil) {
        this.attachVeil(settings, this.authority?.getSession().seed ?? this.seed);
      }
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

    await waitForVeilKeys(veil.room);
    await veil.room.publishHeader(support.deck(settings.config).cardIds);
    await veil.room.advanceCeremony();
    await waitForCeremony(veil.session, 0, settings.seats, () => this.publishCeremonyProgress());

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
    this.seed = seed;
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
      this.veilInbox = this.veilInbox
        .then(async () => {
          await room.receive(peerId, message);
          if (message.type === 'veil.entry') {
            const payload = message.entry.payload as { epoch?: unknown };
            if (typeof payload.epoch === 'number') await room.advanceCeremony(payload.epoch);
          }
        })
        .catch((error: unknown) => {
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
    // A paused veiled round means a seat's cards cannot be reopened at all.
    // Letting moves through anyway would print "paused" while the table kept
    // playing into a board nobody can finish scoring.
    if (this.snapshot.security.paused) throw new Error(this.snapshot.security.paused);
    const recyclable = this.recyclableCards(move);
    if (recyclable) {
      if (this.recycleActionPending) throw new Error('The stock is already being re-veiled');
      this.recycleActionPending = true;
      void this.sendAfterRecycle(move, payload, reveals, recyclable).finally(() => {
        this.recycleActionPending = false;
      });
      return;
    }
    this.sendNow(move, payload, reveals);
  }

  private sendNow(
    move: string,
    payload?: unknown,
    reveals?: readonly string[],
    recycle?: CardRecycle,
  ): void {
    if (!this.transport || this.snapshot.localSeat === null) {
      throw new Error('your seat is not connected');
    }
    this.transport.send({
      id: `${this.profile.profileId}:${this.sequence++}`,
      seat: this.snapshot.localSeat,
      move,
      payload,
      ...this.openingsFor(payload, reveals),
      ...(recycle ? { recycle } : {}),
    });
  }

  private async sendAfterRecycle(
    move: string,
    payload: unknown,
    reveals: readonly string[] | undefined,
    cards: readonly string[],
  ): Promise<void> {
    try {
      const recycle = await this.reveil(cards);
      if (this.snapshot.security.paused) throw new Error(this.snapshot.security.paused);
      this.sendNow(move, payload, reveals, recycle);
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : 'The stock could not be re-veiled',
      });
    }
  }

  /** Public cards that this move must exchange for a fresh hidden stock. */
  private recyclableCards(move: string): readonly string[] | null {
    if (!this.veil || !this.authority) return null;
    const state = this.authority.getSession().state;
    if (this.snapshot.gameId === 'blitz' && move === 'draw.stock') {
      const blitz = state as BlitzState;
      if (blitz.stock.length === 0 && blitz.discard.length > 1) {
        const cards = blitz.discard.slice(1);
        return cards.some((card) => !isVeilHandle(card)) ? cards : null;
      }
    }
    if (this.snapshot.gameId === 'wildpile' && move === 'draw') {
      const wild = state as WildpileState;
      if (wild.stock.length === 0 && wild.discard.length > 1) {
        const cards = wild.discard.slice(1);
        return cards.some((card) => !isVeilHandle(card)) ? cards : null;
      }
    }
    return null;
  }

  /** Runs one new epoch and returns the unpaired exchange the engine logs. */
  private async reveil(cards: readonly string[]): Promise<CardRecycle> {
    const veil = this.veil;
    if (!veil) throw new Error('this room is not running Veil');
    const epoch = (veil.session.liveEpochs().at(-1) ?? -1) + 1;
    const participants = this.snapshot.seats
      .filter((seat) => seat.connected && !seat.bot)
      .map((seat) => seat.seat)
      .sort((a, b) => a - b);
    if (participants.length === 0) throw new Error('no connected seat can re-veil the stock');

    await veil.room.startRecycle(epoch, cards, participants);
    await waitForCeremony(veil.session, epoch, participants.length);
    const issue = cards.map((_, position) => veil.session.handleFor(epoch, position));
    if (issue.some((handle) => handle === null)) {
      throw new Error('the recycled epoch did not issue every card handle');
    }
    return { retire: [...cards], issue: issue as string[] };
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

  /**
   * Rebuilds a departed seat's layer so the round can continue.
   *
   * This is the one moment Veil trades privacy for playability, so it is never
   * silent: the seat is named in the badge afterwards. When the room's policy
   * has no honest threshold — two seats — the round pauses instead, and the
   * message says exactly why rather than blaming the network.
   */
  private async recoverLostSeat(seat: number): Promise<void> {
    const veil = this.veil;
    if (!veil || seat === this.snapshot.localSeat) return;
    veil.room.markSeatLost(seat);
    // Every epoch, not just the opening deal: a recycled stock has its own
    // layer, and leaving that one sealed would wedge the round just as surely.
    const epochs = veil.session.liveEpochs();
    const results = await Promise.all(epochs.map((epoch) => veil.room.recoverSeat(seat, epoch)));
    const recovered = results.length > 0 && results.every(Boolean);
    this.update({
      security: {
        ...this.snapshot.security,
        recoveredSeats: veil.room.recoveredSeats(),
        paused: recovered
          ? null
          : veil.session.recovery.mode === 'none'
            ? `Seat ${seat} left. ${veil.session.recovery.disclosure}`
            : `Seat ${seat} left and not enough players are here to reopen their cards. ` +
              `The round is paused until ${veil.session.recovery.threshold} of them are back.`,
      },
    });
    if (recovered) {
      void this.openMyHandles();
      if (this.snapshot.isHost) {
        void this.openSeatHandles(seat).then(() => this.driveBotSeats());
      }
    }
  }

  /**
   * Plays for any seat a bot has taken over.
   *
   * Host-only, because every peer can see whose turn it is and all of them
   * driving would mean every one of them submitting the same move. The schedule
   * is keyed by log position, so a re-render, a late packet or a host handover
   * cannot fire the same turn twice.
   */
  private driveBotSeats(): void {
    if (!this.snapshot.isHost || !this.authority || !this.snapshot.settings) return;
    if (this.snapshot.security.paused) return;
    const session = this.authority.getSession();
    const botSeats = this.snapshot.seats.filter((seat) => seat.bot).map((seat) => seat.seat);
    if (botSeats.length === 0) return;

    const def = gameDefFor(this.snapshot.settings);
    // Under Veil the host reasons over what it can actually read, which for a
    // departed seat is its rebuilt hand. Nothing here reaches another peer.
    const view = this.veil
      ? resolveVeiledState(session.state, this.veil.session.knownFaces())
      : session.state;

    const turns = botTurns({
      def: def as never,
      session: session as never,
      view: view as never,
      botSeats,
    });
    for (const turn of turns) {
      const key = botTurnKey(session as never, turn.seat);
      if (this.scheduledBotTurns.has(key)) continue;
      this.scheduledBotTurns.add(key);
      setTimeout(() => void this.submitBotTurn(key, turn.seat, turn.move), turn.thinkMs);
    }
  }

  private async submitBotTurn(key: string, seat: number, move: LegalMove): Promise<void> {
    this.scheduledBotTurns.delete(key);
    const transport = this.transport;
    if (!transport || !this.snapshot.isHost || this.snapshot.security.paused) return;
    if (!this.snapshot.seats.find((player) => player.seat === seat)?.bot) return;
    // The board may have moved on while the bot was "thinking".
    let session = this.authority?.getSession();
    if (!session || session.status !== 'playing' || !isActingSeat(session.phase, seat)) return;
    try {
      const recyclable = this.recyclableCards(move.id);
      const recycle = recyclable ? await this.reveil(recyclable) : undefined;
      session = this.authority?.getSession();
      if (
        !session ||
        session.status !== 'playing' ||
        !isActingSeat(session.phase, seat) ||
        !this.snapshot.seats.find((player) => player.seat === seat)?.bot
      ) {
        return;
      }
      transport.sendAsBot({
        id: `bot:${seat}:${this.sequence++}`,
        seat,
        move: move.id,
        payload: move.payload,
        ...this.openingsFor(move.payload),
        ...(recycle ? { recycle } : {}),
      });
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : 'A bot seat could not play',
      });
    }
  }

  /**
   * Opens a departed seat's cards for the host, so a bot can play them. The
   * faces are filed as surrogate: readable for choosing a move, and kept out of
   * the host's own rendered table.
   */
  private async openSeatHandles(seat: number): Promise<void> {
    const veil = this.veil;
    const state = this.authority?.getSession().state as { hands?: unknown } | undefined;
    if (!veil || !state) return;
    const theirs = Array.isArray(state.hands) ? (state.hands[seat] as unknown) : null;
    if (!Array.isArray(theirs)) return;
    const wanted = theirs.filter(
      (card): card is string => typeof card === 'string' && !veil.session.knownFaces().has(card),
    );
    for (const handle of wanted) {
      const at = veil.session.positionFor(handle);
      if (!at) continue;
      try {
        await veil.room.open(at.epoch, at.position, 'surrogate');
      } catch {
        // A card that will not open leaves that seat unplayable; the badge
        // already says the round is in trouble, so do not spam the error slot.
        return;
      }
    }
  }

  /** Re-presents the authority's state now that this seat knows more faces. */
  private refreshView(): void {
    if (!this.authority) return;
    this.update({ session: this.presented(this.authority.getSession()) });
  }

  private presented(session: MultiplayerGameSession): MultiplayerGameSession {
    const known = this.veil?.session.visibleFaces();
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
    this.veil?.room.cancelAll();
    this.veil = null;
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
      heartbeatIntervalMs: this.dependencies.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.dependencies.heartbeatTimeoutMs,
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
        security: {
          ...this.snapshot.security,
          ceremony: {
            laid: settings.seats,
            seats: settings.seats,
            ready: settings.security === 'veil',
          },
        },
      });
      void this.openMyHandles();
    });
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
    if (this.veil) {
      void this.openMyHandles();
      if (this.snapshot.isHost) {
        void this.openBotHandles().then(() => this.driveBotSeats());
      }
    } else {
      this.driveBotSeats();
    }
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
      const isHost = presence.hostId === this.snapshot.room?.peerId;
      this.update({
        isHost,
        room: this.snapshot.room
          ? { ...this.snapshot.room, hostId: presence.hostId }
          : this.snapshot.room,
      });
      if (isHost) void this.openBotHandles().then(() => this.driveBotSeats());
      return;
    }
    if (presence.kind === 'peer.joined' || presence.kind === 'seat.reclaimed') {
      const isLocal = presence.peerId === this.snapshot.room?.peerId;
      this.veil?.room.markSeatPresent(presence.seat);
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
      if (
        isLocal &&
        !this.veil &&
        this.snapshot.settings?.security === 'veil' &&
        this.snapshot.localSeat !== null &&
        this.snapshot.room
      ) {
        this.attachVeil(this.snapshot.settings, this.authority?.getSession().seed ?? this.seed);
      }
      return;
    }
    if (presence.kind === 'peer.left') {
      this.update({
        seats: this.snapshot.seats.map((seat) =>
          seat.seat === presence.seat ? { ...seat, connected: false, bot: true } : seat,
        ),
      });
      // A veiled room cannot keep dealing while a departed seat's layer is
      // missing, so ask the room to rebuild it — or say plainly that it cannot.
      if (this.veil) void this.recoverLostSeat(presence.seat);
      else this.driveBotSeats();
    }
  }

  private acceptSeatBot(seat: number, bot: boolean): void {
    this.update({
      seats: this.snapshot.seats.map((player) =>
        player.seat === seat ? { ...player, bot, connected: !bot } : player,
      ),
    });
    if (bot && !this.veil) this.driveBotSeats();
  }

  private async openBotHandles(): Promise<void> {
    if (!this.snapshot.isHost || !this.veil) return;
    const botSeats = this.snapshot.seats.filter((seat) => seat.bot).map((seat) => seat.seat);
    await Promise.all(botSeats.map((seat) => this.openSeatHandles(seat)));
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

export function ratscrewMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<RatscrewState, RatscrewConfig> | null {
  return snapshot.gameId === 'ratscrew'
    ? (snapshot.session as GameSession<RatscrewState, RatscrewConfig> | null)
    : null;
}

export function ginMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<GinMatchState, GinConfig> | null {
  return snapshot.gameId === 'gin'
    ? (snapshot.session as GameSession<GinMatchState, GinConfig> | null)
    : null;
}

export function wildMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<WildpileState, WildpileRules> | null {
  return snapshot.gameId === 'wildpile'
    ? (snapshot.session as GameSession<WildpileState, WildpileRules> | null)
    : null;
}

export function euchreMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<EuchreState, EuchreRules> | null {
  return snapshot.gameId === 'euchre'
    ? (snapshot.session as GameSession<EuchreState, EuchreRules> | null)
    : null;
}

export function cribbageMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<CribbageState, CribbageConfig> | null {
  return snapshot.gameId === 'cribbage'
    ? (snapshot.session as GameSession<CribbageState, CribbageConfig> | null)
    : null;
}

export function heartsMultiplayerSession(
  snapshot: MultiplayerRoomSnapshot,
): GameSession<HeartsState, HeartsRules> | null {
  return snapshot.gameId === 'hearts'
    ? (snapshot.session as GameSession<HeartsState, HeartsRules> | null)
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
  if (settings.gameId === 'ratscrew') return ratscrewGame;
  if (settings.gameId === 'euchre') return createEuchreDef();
  if (settings.gameId === 'hearts') return heartsGame;
  if (settings.gameId === 'gin') return createGinMatchDef();
  if (settings.gameId === 'wildpile') return wildpileGame;
  if (settings.gameId === 'cribbage') return createCribbageDef();
  if (settings.gameId === 'president') return presidentGame;
  return createBlitzDef();
}

/**
 * Waits for the ceremony to reach `laid` layers. Peers publish their layers
 * over the mesh, so the host has to let those land before laying the next one.
 */
async function waitForCeremony(
  session: VeilSession,
  epoch: number,
  seats: number,
  onProgress?: () => void,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    const progress = session.progress(epoch);
    onProgress?.();
    if (progress.ready || progress.laid >= seats) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the shuffle ceremony stalled — a seat never published its layer');
}

async function waitForVeilKeys(room: VeilRoom): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (room.keysReady) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the shuffle ceremony stalled — a seat never published its key');
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
  if (settings.gameId === 'ratscrew') {
    return {
      gameId: 'ratscrew',
      seats: settings.seats,
      config: ratscrewConfigSchema.resolve(settings.config as Partial<RatscrewConfig>),
      security,
    };
  }
  if (settings.gameId === 'euchre') {
    return {
      gameId: 'euchre',
      seats: settings.seats,
      config: euchreConfig.resolve(settings.config as Partial<EuchreRules>),
      security,
    };
  }
  if (settings.gameId === 'cribbage') {
    if (settings.seats !== 2) throw new Error('Cribbage rooms require exactly two seats');
    if (security === 'veil') {
      throw new Error('Cribbage friend rooms use open replay until multi-deal re-veiling ships');
    }
    const config = cribbageConfigSchema.resolve(settings.config as Partial<CribbageConfig>);
    return {
      gameId: 'cribbage',
      seats: 2,
      // Friend rooms currently represent one replayable GameSession. Match
      // Play is deliberately solo until room snapshots carry MatchSession
      // round logs, so never let a forged announcement imply best-of-three.
      config: { ...config, gamesToWin: 1 },
      security: 'open',
    };
  }
  if (settings.gameId === 'hearts') {
    return {
      gameId: 'hearts',
      seats: settings.seats,
      config: heartsConfigSchema.resolve(settings.config as Partial<HeartsRules>),
      security,
    };
  }
  if (settings.gameId === 'gin') {
    return {
      gameId: 'gin',
      seats: settings.seats,
      config: ginConfigSchema.resolve(settings.config as Partial<GinConfig>),
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
  if (settings.gameId === 'ratscrew') {
    const config = settings.config as RatscrewConfig;
    const session = createSession(ratscrewGame, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def: ratscrewGame, session, ...common });
    return { session, authority };
  }

  if (settings.gameId === 'euchre') {
    const def = createEuchreDef();
    const config = settings.config as EuchreRules;
    const session = createSession(def, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def, session, ...common });
    return { session, authority };
  }
  if (settings.gameId === 'hearts') {
    const config = settings.config as HeartsRules;
    const session = createSession(heartsGame, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def: heartsGame, session, ...common });
    return { session, authority };
  }
  if (settings.gameId === 'gin') {
    const def = createGinMatchDef();
    const config = settings.config as GinConfig;
    const session = createSession(def, { seed, config, seats: settings.seats, ...veil });
    const authority = new EngineAuthority({ def, session, ...common });
    return { session, authority };
  }
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

  if (settings.gameId === 'cribbage') {
    const def = createCribbageDef();
    const config = settings.config as CribbageConfig;
    const session = createSession(def, { seed, config, seats: 2 });
    const authority = new EngineAuthority({ def, session, settings: runtimeSettings, onSeatBot });
    return { session, authority };
  }

  const def = createBlitzDef();
  const config = settings.config as BlitzConfig;
  const session = createSession(def, { seed, config, seats: settings.seats, ...veil });
  const authority = new EngineAuthority({ def, session, ...common });
  return { session, authority };
}
