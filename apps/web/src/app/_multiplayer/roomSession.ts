'use client';

import {
  isActingSeat,
  resolveVeiledState,
  stateContainsCardId,
  type CardRecycle,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type RuleValues,
  type SeatId,
} from '@parlour/engine';
import {
  P2PTransport,
  type AppliedPacket,
  type PresenceEvent,
  type RoomHandle,
  type RoomSecurity,
  type RoomSettings,
} from '@/lib/multiplayer';
import {
  auditSummary,
  layerStream,
  loadRoundMaterial,
  recoveryPolicyFor,
  VeilRoom,
  VeilSession,
  type RecoveryPolicy,
  type VeilAuditState,
} from '@/lib/multiplayer/veil';
import { botTurnKey } from './botSeats';
import { NostrSignaling, type RoomAnnouncement } from '@/lib/multiplayer/NostrSignaling';
import { createDealNonce, dealCommitment, DealSeedRound } from '@/lib/multiplayer/dealSeed';
import { validateRoomCode } from '@/lib/rooms/code';
import { hasValidSeatCount } from '@/lib/rooms/seatRange';
import type { MultiplayerGameId } from '@/lib/rooms/gameIds';
import {
  roomGame,
  seatRefusal,
  type MultiplayerGameSession,
  type RoomGamePack,
  type RoomRuntime,
  type SessionAuthority,
} from '@/lib/rooms/gameRegistry';

export type { MultiplayerGameId } from '@/lib/rooms/gameIds';
export type {
  MultiplayerGameSession,
  RoomGamePack,
  SessionAuthority,
} from '@/lib/rooms/gameRegistry';

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
  /** how long a veiled round holds a dropped seat open before recovering it */
  reconnectGraceMs?: number;
};

type Listener = () => void;

/**
 * How long the host waits for every seat's shuffle share before giving up.
 *
 * Generous, because it covers a phone waking its radio, and finite, because a
 * seat that never answers must produce an error rather than a table that hangs
 * on "dealing…" forever.
 */
const DEAL_ROUND_TIMEOUT_MS = 10_000;

/**
 * How long a veiled round holds a seat open for a player who dropped.
 *
 * Long enough to cover a phone changing networks, a locked screen or a reload,
 * because the alternative to waiting is opening their hand to the rest of the
 * table. Finite, because a round cannot wait forever on somebody who has gone.
 */
const RECONNECT_GRACE_MS = 45_000;

/**
 * Opening a room takes no privacy tier, because nobody is asked for one.
 * {@link tierFor} derives it from the game the room is for.
 */
type CreateRoomOptions = {
  seats: number;
  gameId?: MultiplayerGameId;
  config?: RuleValues;
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
  /**
   * The in-flight veil attachment.
   *
   * Attaching became asynchronous when a seat started restoring its material
   * instead of minting it, so dealing has to wait for it: `start` can otherwise
   * be pressed while the room's own key is still being read back.
   */
  private veilAttach: Promise<void> | null = null;
  private seed = 0;
  /** This seat's shuffle share, minted once per room and revealed at the deal. */
  private dealNonce: string | null = null;
  private dealRound = new DealSeedRound();
  private sequence = 0;
  private recycleActionPending = false;
  /** a veiled redeal ceremony already under way, so it cannot start twice */
  private redealPending = false;
  private openPending = false;
  /** bot turns already scheduled, keyed by log position, so none fires twice */
  private readonly scheduledBotTurns = new Set<string>();
  /** seats being held open for a player who dropped, keyed by seat */
  private readonly pendingReturns = new Map<number, ReturnType<typeof setTimeout>>();
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
    // Seat and security validation both live in resolveRoomSettings now, so a
    // room this client creates goes through exactly the checks a room it joins
    // does. The two used to be separate chains and could disagree.
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
      if (settings.security === 'veil')
        this.veilAttach = this.attachVeil(settings, this.seed).catch(() => undefined);
      this.commitDealShare();
      return room;
    } catch (error) {
      this.fail(error, 'Could not create the room. Check your connection and try again.');
      throw error;
    }
  }

  /**
   * Joins a room by code.
   *
   * A four-character code is a 20-bit PUBLIC locator, not an authenticator:
   * anyone who learns it can answer to it, so resolving by code alone is
   * last-writer-wins. `expectedHost` is the host-binding capability carried by
   * a share link — when present it is forwarded to BOTH the directory lookup
   * and the transport, so a hijacker who republishes the same code with a later
   * timestamp is refused at two independent layers. Typed codes have no such
   * capability and stay best-effort.
   */
  async join(code: string, expectedHost?: string): Promise<RoomHandle> {
    this.update({ connection: 'connecting' });
    const verdict = validateRoomCode(code);
    if (!verdict.ok) throw new Error('Room codes use four unambiguous letters or digits');
    const signaling = this.dependencies.signaling ?? new NostrSignaling();
    let announcement: RoomAnnouncement | null = null;
    try {
      announcement = await signaling.resolve(verdict.code, expectedHost);
      const settings = resolveRoomSettings(announcement.settings);
      this.prepare(settings, signaling);
      const room = await this.transport!.join(verdict.code, announcement, expectedHost);
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
        this.veilAttach = this.attachVeil(
          settings,
          this.authority?.getSession().seed ?? this.seed,
        ).catch(() => undefined);
      }
      return room;
    } catch (error) {
      if (!this.transport) signaling.close();
      this.fail(error, `Table ${code} isn't answering. Check the code and try again.`);
      throw error;
    }
  }

  /**
   * Seats a house bot in an empty lobby chair.
   *
   * A friend room with bots cannot run Veil — the bots live on the host device
   * and have no shuffle layer — so `start` deals that table in the open.
   */
  addBot(seat: number): void {
    if (!this.snapshot.isHost || this.snapshot.stage !== 'lobby' || !this.transport) return;
    const capacity = this.snapshot.settings?.seats ?? 0;
    if (!Number.isInteger(seat) || seat < 1 || seat >= capacity) return;
    if (this.snapshot.seats.some((player) => player.seat === seat)) return;
    try {
      this.transport.seatBot(seat);
    } catch {
      // A friend sat in the same chair between the click and the assign.
    }
  }

  async start(): Promise<void> {
    if (!this.snapshot.isHost) {
      const error = new Error('only the host can start the match');
      this.update({ error: startFault(error) });
      throw error;
    }
    if (this.snapshot.seats.length < (this.snapshot.settings?.seats ?? 2)) {
      const error = new Error('every seat must be filled before the match starts');
      this.update({ error: startFault(error) });
      throw error;
    }
    try {
      const houseBots = this.snapshot.seats.some((seat) => seat.bot);
      if (this.snapshot.security.tier === 'veil' && !houseBots) {
        // A veiled deal takes its unpredictability from the ceremony itself —
        // every seat lays a layer on a deck nobody can read — so it needs no
        // separate seed round, and it publishes the real position at the end.
        await this.dealVeiled();
      } else {
        // An open room had no "the host dealt" signal at all, which is why a
        // guest used to be pushed onto the table the moment it was seated. The
        // deal is rebuilt on the seed every seat mixed, then published: the same
        // snapshot a veiled deal sends, and peers adopt an unsolicited one only
        // while their own log is still empty, so it opens the table for everyone
        // without being able to rewrite a round in progress.
        //
        // House bots also take this path: they have no Veil key, so a ceremony
        // that waited on every seat would hang, and the host already sees their
        // cards.
        await this.dealOpen();
        if (houseBots) {
          const seats = this.snapshot.settings?.seats ?? this.snapshot.seats.length;
          this.update({ security: securityFor('open', seats, 'open') });
        }
      }
      this.transport?.holdLobby(false);
      this.update({ stage: 'table', error: null });
    } catch (error) {
      this.update({ error: startFault(error) });
      throw error;
    }
  }

  /**
   * Deals an open room on the seed every seat mixed.
   *
   * The host reveals first — it is the one who pressed the button — and every
   * other seat reveals on seeing a reveal, so the round closes in one round
   * trip. If a seat never answers, the deal does not happen and the room says
   * which seat is missing: dealing on the host's own number instead would drop
   * the guarantee silently, which is the one outcome worth refusing.
   */
  private async dealOpen(): Promise<void> {
    const settings = this.snapshot.settings;
    const code = this.snapshot.room?.code;
    if (!settings || !code || !this.transport || !this.authority) {
      throw new Error('the room is not ready to deal');
    }
    this.revealDealShare();
    const seats = this.contributingSeats();
    await this.waitForDealShares(seats);

    const seed = await this.dealRound.resolve(code, seats);
    this.seed = seed;
    const runtime = createRoomRuntime(settings, seed, (seat, bot) => this.acceptSeatBot(seat, bot));
    this.authority.importSnapshot(runtime.authority.exportSnapshot());
    this.transport.publishSnapshot();
    this.update({
      session: this.presented(this.authority.getSession()),
      fx: runtime.session.setupFx ?? [],
      fxKey: this.snapshot.fxKey + 1,
    });
  }

  /** Seats that owe a share: every seated peer, bots excluded — they have none. */
  private contributingSeats(): SeatId[] {
    return this.snapshot.seats
      .filter((seat) => !seat.bot)
      .map((seat) => seat.seat as SeatId)
      .sort((left, right) => left - right);
  }

  /** Publishes this seat's commitment; safe to call whenever the table changes. */
  private commitDealShare(): void {
    const code = this.snapshot.room?.code;
    const seat = this.snapshot.localSeat;
    if (!this.transport || !code || seat === null) return;
    this.dealNonce ??= createDealNonce();
    const nonce = this.dealNonce;
    void dealCommitment(code, seat as SeatId, nonce)
      .then((commit) => {
        this.dealRound.recordCommitment(seat as SeatId, commit);
        this.transport?.sendDeal({ type: 'deal.commit', commit });
      })
      .catch(() => undefined);
  }

  private revealDealShare(): void {
    const seat = this.snapshot.localSeat;
    if (!this.transport || seat === null || !this.dealNonce) return;
    if (this.dealRound.hasContribution(seat as SeatId)) return;
    this.dealRound.recordContribution(seat as SeatId, this.dealNonce);
    this.transport.sendDeal({ type: 'deal.reveal', nonce: this.dealNonce });
  }

  private async waitForDealShares(seats: readonly SeatId[]): Promise<void> {
    const deadline = Date.now() + DEAL_ROUND_TIMEOUT_MS;
    while (this.dealRound.missing(seats).length > 0) {
      if (Date.now() > deadline) {
        const missing = this.dealRound.missing(seats).map((seat) => `Seat ${seat + 1}`);
        throw new Error(
          `${missing.join(' and ')} never mixed the shuffle, so nobody could deal. Try again.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /**
   * Checks the deal the host published is the one the table's shares add up to.
   *
   * Without this the shares would be theatre: the host could collect them and
   * then deal from whatever number it liked. A mismatch is stated rather than
   * silently tolerated, because a table that cannot trust its own deal should
   * be told so at the first hand rather than never.
   */
  private verifyPublishedDeal(): void {
    const code = this.snapshot.room?.code;
    const dealt = this.authority?.getSession().seed;
    if (!code || dealt === undefined || this.snapshot.security.tier === 'veil') return;
    const seats = this.contributingSeats();
    if (seats.some((seat) => !this.dealRound.hasContribution(seat))) return;
    void this.dealRound
      .resolve(code, seats)
      .then((expected) => {
        if (expected === dealt) return;
        this.update({
          error:
            'This deal does not match the shuffle the table mixed. The host dealt from its own ' +
            'number, so the deck it handed out cannot be trusted.',
        });
      })
      .catch((error: unknown) => {
        this.update({
          error: error instanceof Error ? error.message : 'the deal could not be checked',
        });
      });
  }

  /**
   * Runs the shuffle ceremony, opens the setup cards the game needs face up,
   * and swaps the lobby's placeholder deal for the real veiled one. Nothing is
   * dealt for real until every seat has laid a layer, which is why this cannot
   * happen at room creation: the table has to be full first.
   */
  private async dealVeiled(): Promise<void> {
    // The room may still be reading its own material back off the shelf.
    await this.veilAttach;
    const veil = this.veil;
    const settings = this.snapshot.settings;
    if (!veil || !settings || !this.transport) throw new Error('the veiled room is not ready');
    const support = packFor(settings).veilSupport();
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
  private async attachVeil(settings: RoomSettings, seed: number): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    this.seed = seed;
    const roomCode = this.snapshot.room?.code ?? 'ROOM';
    // Restored if this seat has been in this room before, minted if not. This
    // one line is what turns a disconnect into something a player can walk back
    // from: the same key signs, and the same layers derive.
    const material = await loadRoundMaterial(roomCode, this.profile.profileId);
    const session = new VeilSession({
      roomCode,
      seed,
      seat: this.snapshot.localSeat ?? 0,
      seats: settings.seats,
      gameId: settings.gameId,
      config: settings.config,
      identity: material.identity,
      layerRandom: (epoch) => layerStream(material.masterSeed, roomCode, epoch),
    });
    const room = new VeilRoom(
      session,
      {
        send: (message, to) => transport.sendVeil(message, to),
        peerIdForSeat: (seat) => transport.peerIdForSeat(seat),
        seatForPeer: (peerId) => transport.seatForPeerId(peerId),
      },
      settings.seats,
      (restored) => this.onVeilResume(restored),
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
            error: startFault(error, 'A Veil message was rejected'),
          });
        });
    });
    // Loading the material was the first await in this method, so the room may
    // have been left or replaced while it ran. Announcing into a closed
    // transport would throw where nobody is waiting to catch it.
    if (this.transport !== transport) return;
    this.veil = { session, room };
    await room.announce();
    if (this.transport !== transport) return;
    // Only a seat that already sat here needs the transcript replayed. A
    // first join used to broadcast `veil.catchup.request` in the lobby;
    // builds that predate that message refuse it as a malformed packet,
    // which is exactly "join works, host start dies" when one peer is older.
    if (material.resumed) room.requestCatchUp();
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
    const settings = this.snapshot.settings;
    if (!this.veil || !this.authority || !settings) return null;
    return packFor(settings).recyclableStock(this.authority.getSession().state, move);
  }

  /** Runs one new epoch and returns the unpaired exchange the engine logs. */
  /**
   * Deals a veiled game's next hand, once it says it is waiting for one.
   *
   * A match that spans several deals needs a ceremony per deal, and an open
   * room simply deals itself the next hand from the session rng — which under
   * Veil would hand every seat a readable deck halfway through a private match.
   * So the game says it is waiting — `pack.redealPending` — and the host
   * shuffles a fresh epoch and injects the move with the deck it produced.
   *
   * Host-only, because injection is: two peers shuffling at once would open two
   * epochs for the same hand and neither would be the one that was dealt.
   */
  private maybeDealVeiledHand(): void {
    if (!this.snapshot.isHost || !this.veil || !this.authority || this.redealPending) return;
    const settings = this.snapshot.settings;
    if (!settings) return;
    const pack = roomGame(settings.gameId);
    const move = pack.redealMove;
    if (!move || !pack.redealPending(this.authority.getSession().state)) return;

    this.redealPending = true;
    void this.shuffleNextHand()
      .then((deckOrder) => this.inject(move, { deckOrder }))
      .catch((error: unknown) => {
        this.update({
          error: error instanceof Error ? error.message : 'The next hand could not be shuffled',
        });
      })
      .finally(() => {
        this.redealPending = false;
      });
  }

  /**
   * Turns the cards a veiled hand has to show, and only those.
   *
   * Hold'em is the reason this exists: the board arrives a street at a time and
   * every card of it is public the moment it lands, which no other veiled game
   * on the shelf needs. A showdown is the same mechanism pointed at hole cards.
   * Both are named by the pack, so the room never has to know what a street is
   * — it opens the handles it was given and injects the move it was told to.
   *
   * Host-only, for the same reason the redeal is: two peers opening the same
   * position would each start a chain and neither would finish.
   */
  private maybeOpenVeiledCards(): void {
    if (!this.snapshot.isHost || !this.veil || !this.authority || this.openPending) return;
    const settings = this.snapshot.settings;
    if (!settings) return;
    const pending = roomGame(settings.gameId).publicOpenPending(this.authority.getSession().state);
    if (!pending) return;

    this.openPending = true;
    void this.openInPublic(pending.handles)
      .then((reveals) => this.inject(pending.move, undefined, { reveals }))
      .catch((error: unknown) => {
        this.update({
          error: error instanceof Error ? error.message : 'A card could not be turned face up',
        });
      })
      .finally(() => {
        this.openPending = false;
      });
  }

  /** Peels each handle in public and pairs it with the card it opened to. */
  private async openInPublic(handles: readonly string[]): Promise<(readonly [string, string])[]> {
    const veil = this.veil;
    if (!veil) throw new Error('this room is not running Veil');
    const reveals: (readonly [string, string])[] = [];
    for (const handle of handles) {
      const at = veil.session.positionFor(handle);
      if (!at) throw new Error('a card to be turned is not in any open epoch');
      const card = await veil.room.open(at.epoch, at.position, 'public');
      reveals.push([handle, card]);
    }
    return reveals;
  }

  /**
   * Runs a whole shuffle ceremony for the next hand and returns its deck.
   *
   * The same shape as the opening deal: open an epoch over the deck, let every
   * connected seat lay a layer, turn the game's setup cards face up, and read
   * the order off the epoch. The handles are numbered from where the last epoch
   * stopped, so a second hand can never reissue a card the first one spent.
   */
  private async shuffleNextHand(): Promise<readonly string[]> {
    const veil = this.veil;
    const settings = this.snapshot.settings;
    if (!veil || !settings) throw new Error('this room is not running Veil');
    const support = roomGame(settings.gameId).veilSupport();
    if (!support) throw new Error(`${settings.gameId} cannot run a veiled room`);

    const epoch = (veil.session.liveEpochs().at(-1) ?? -1) + 1;
    const participants = this.snapshot.seats
      .filter((seat) => seat.connected && !seat.bot)
      .map((seat) => seat.seat)
      .sort((left, right) => left - right);
    if (participants.length === 0) throw new Error('no connected seat can shuffle the next hand');

    await veil.room.startRecycle(epoch, support.deck(settings.config).cardIds, participants);
    await waitForCeremony(veil.session, epoch, participants.length, () =>
      this.publishCeremonyProgress(),
    );

    const from = veil.session.publicSetupPositions(support, 0);
    const opened: string[] = [];
    for (let step = 0; step < 8 && !veil.session.publicSetupSatisfied(support, opened); step++) {
      opened.push(await veil.room.open(epoch, from + step, 'public'));
    }
    return veil.session.redealPlan(epoch, support, opened).deckOrder;
  }

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
    const settings = this.snapshot.settings;
    const state = this.authority?.getSession().state;
    if (!veil || seat === null || !state || !settings) return;
    // Where a seat's own cards live is the pack's business: most games keep
    // them in `hands`, a poker seat holds `hole`, and a crazy eights hand is
    // nested inside the round on the table.
    const mine = roomGame(settings.gameId).privateHandles(state, seat);

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
  /**
   * Holds a seat open for a player who dropped, and only recovers it if they
   * stay gone.
   *
   * The order matters more than the delay. Recovery rebuilds a seat's layer out
   * of other people's shares, which means whoever holds them can read every
   * card that seat was dealt — the protocol reports it as the privacy loss it
   * is. A player who simply reconnects rebuilds that same layer themselves, out
   * of material nobody else ever had. So waiting is not politeness, it is the
   * difference between a round that stays private and one that does not.
   */
  private awaitReturnThenRecover(seat: number): void {
    if (this.pendingReturns.has(seat)) return;
    // Marked gone now, recovered later. A seat only offers its share of a
    // missing layer for a seat it agrees has gone, so if each peer waited out
    // its own hold before agreeing, whoever asked first would be asking peers
    // that had not noticed yet and would collect nothing. Noticing is driven by
    // presence, which every peer sees; the hold only delays acting on it.
    this.veil?.room.markSeatLost(seat);
    this.update({
      security: {
        ...this.snapshot.security,
        paused: `Seat ${seat + 1} dropped. Waiting for them to come back…`,
      },
    });
    const timer = setTimeout(() => {
      this.pendingReturns.delete(seat);
      void this.recoverLostSeat(seat);
    }, this.dependencies.reconnectGraceMs ?? RECONNECT_GRACE_MS);
    this.pendingReturns.set(seat, timer);
  }

  /** A seat came back before the room gave up on it. */
  private cancelPendingReturn(seat: number): void {
    const timer = this.pendingReturns.get(seat);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pendingReturns.delete(seat);
    this.veil?.room.markSeatPresent(seat);
    // Their layer came back with them, so nothing was opened and the round
    // simply continues.
    if (this.snapshot.security.paused?.includes(`Seat ${seat + 1}`)) {
      this.update({ security: { ...this.snapshot.security, paused: null } });
      this.driveBotSeats();
    }
  }

  /**
   * What this seat does when the table replays the round to it.
   *
   * `restored` false means the material this browser needed is gone — cleared
   * storage, a different device — so it cannot rebuild the layers it laid. It
   * says so instead of playing on with a layer that is not the one the
   * transcript accepted, and the table recovers the seat the older way.
   */
  private onVeilResume(restored: boolean): void {
    if (!restored) {
      this.update({
        error:
          'Your shuffle layers could not be rebuilt on this device, so the table has to reopen ' +
          'your cards to continue. The round is no longer private for this seat.',
      });
      return;
    }
    this.update({
      error: null,
      security: { ...this.snapshot.security, paused: null },
    });
    void this.openMyHandles();
  }

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

    // Under Veil the host reasons over what it can actually read, which for a
    // departed seat is its rebuilt hand. Nothing here reaches another peer.
    const view = this.veil
      ? resolveVeiledState(session.state, this.veil.session.knownFaces())
      : session.state;

    // The pack owns the cast back to its own (State, Config). This used to be
    // three `as never`s here, which erased the very types that make it safe.
    const turns = packFor(this.snapshot.settings).botTurns({ session, view, botSeats });
    for (const turn of turns) {
      const key = botTurnKey(session, turn.seat);
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

  inject(
    move: string,
    payload?: unknown,
    meta?: { reveals?: readonly (readonly [string, string])[] },
  ): void {
    if (!this.transport) throw new Error('the room is not connected');
    this.transport.inject(move, payload, meta?.reveals);
  }

  close(): void {
    if (this.snapshot.isHost && this.snapshot.stage === 'lobby') {
      this.transport?.announceClosed();
    }
    this.teardownTransport();
    this.update({ connection: 'closed' });
  }

  /** Guest-side: the host left the lobby, so this device is no longer in a room. */
  private dissolveLobby(message: string): void {
    this.teardownTransport();
    this.update({ error: message, connection: 'closed' });
    if (getActiveMultiplayerSession() === this) clearActiveMultiplayerSession();
  }

  private teardownTransport(): void {
    this.veil?.room.cancelAll();
    this.veil = null;
    this.transport?.close();
    this.transport = null;
  }

  private prepare(settings: RoomSettings, signaling?: NostrSignaling): void {
    if (this.transport) throw new Error('this session already has an active room');
    const seed = normalizeSeed(this.dependencies.seed ?? randomSeed());
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
    this.transport.onDeal((seat, message) => {
      if (message.type === 'deal.commit') {
        this.dealRound.recordCommitment(seat, message.commit);
        return;
      }
      this.dealRound.recordContribution(seat, message.nonce);
      // Somebody has opened the reveal phase, so answer with this seat's share.
      // The host reveals first when it deals; everyone else follows from here,
      // which closes the round in a single round trip.
      this.revealDealShare();
    });
    this.transport.onSnapshot(() => {
      // The host published the opening position, so adopt it — and check the
      // deal inside it is the one the table's shares add up to.
      const imported = this.authority!.exportSnapshot();
      const openDeal = imported.settings.security !== 'veil';
      this.update({
        session: this.presented(this.authority!.getSession()),
        fx: this.authority!.getSession().setupFx ?? [],
        fxKey: this.snapshot.fxKey + 1,
        stage: 'table',
        security: openDeal
          ? securityFor('open', imported.settings.seats, 'open')
          : {
              ...this.snapshot.security,
              ceremony: {
                laid: settings.seats,
                seats: settings.seats,
                ready: true,
              },
            },
      });
      this.verifyPublishedDeal();
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
    // A hand that just settled may leave a veiled match waiting for its next
    // deck, and a betting round that just closed may leave it waiting for a
    // board. Nothing else notices, because both are the room's job here.
    this.maybeDealVeiledHand();
    this.maybeOpenVeiledCards();
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
    if (presence.kind === 'room.closed') {
      this.dissolveLobby(LOBBY_CLOSED);
      return;
    }
    if (presence.kind === 'host.changed') {
      if (this.snapshot.stage === 'lobby' && !this.snapshot.isHost) {
        this.dissolveLobby(LOBBY_CLOSED);
        return;
      }
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
      this.cancelPendingReturn(presence.seat);
      const existing = this.snapshot.seats.filter((seat) => seat.seat !== presence.seat);
      const houseBot = presence.kind === 'peer.joined' && presence.bot;
      const joined: MultiplayerSeat = isLocal
        ? { ...this.profile, seat: presence.seat, connected: true, bot: false }
        : {
            ...presence.profile,
            seat: presence.seat,
            connected: true,
            bot: houseBot,
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
        // Taking a seat is not the same as the match starting. This used to
        // read `isLocal && !isHost ? 'table' : stage`, which walked a guest
        // straight onto the table while the host was still in the lobby — so
        // the guest played the placeholder deal the host intends to replace,
        // and the two screens disagreed about what was happening. The host
        // deals; everyone waits for `start` to say so.
        stage: this.snapshot.stage,
      });
      // Publish this seat's commitment again whenever the table changes. It is
      // the same share every time, and a peer that has just arrived has not
      // heard the earlier ones.
      this.commitDealShare();
      if (
        isLocal &&
        !this.veil &&
        this.snapshot.settings?.security === 'veil' &&
        this.snapshot.localSeat !== null &&
        this.snapshot.room
      ) {
        this.veilAttach = this.attachVeil(
          this.snapshot.settings,
          this.authority?.getSession().seed ?? this.seed,
        ).catch(() => undefined);
      }
      return;
    }
    if (presence.kind === 'peer.left') {
      if (this.snapshot.stage === 'lobby') {
        this.update({
          seats: this.snapshot.seats.filter((seat) => seat.seat !== presence.seat),
        });
        return;
      }
      this.update({
        seats: this.snapshot.seats.map((seat) =>
          seat.seat === presence.seat ? { ...seat, connected: false, bot: true } : seat,
        ),
      });
      // A veiled room cannot keep dealing while a departed seat's layer is
      // missing. Wait for them first: a player who comes back rebuilds their
      // own layer and nobody's hand is opened, which recovery cannot say.
      // Recovery is what happens when they do not come back.
      if (this.veil) this.awaitReturnThenRecover(presence.seat);
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

/**
 * The seated room has to survive a Next.js client-chunk split.
 *
 * Join and table routes can each evaluate this module as a different copy, so a
 * module-level `let` is not enough: the phone would land on `/wild/table` with
 * no room handle, boot a solo deal, and the host would see that friend leave.
 * `globalThis` is one object per tab. The sessionStorage marker is the belt:
 * a table page that can see the marker but not the handle waits instead of
 * dealing solo.
 */
const ACTIVE_ROOM_KEY = '__parlourActiveRoom';
const ACTIVE_LISTENERS_KEY = '__parlourActiveRoomListeners';
const ROOM_MARKER_KEY = 'parlour.active-room';

type ActiveRoomTab = {
  [ACTIVE_ROOM_KEY]?: MultiplayerRoomSession | null;
  [ACTIVE_LISTENERS_KEY]?: Set<Listener>;
};

function tabStore(): ActiveRoomTab {
  return globalThis as ActiveRoomTab;
}

function activeListeners(): Set<Listener> {
  const store = tabStore();
  store[ACTIVE_LISTENERS_KEY] ??= new Set();
  return store[ACTIVE_LISTENERS_KEY];
}

function rememberActiveRoom(session: MultiplayerRoomSession): void {
  const gameId = session.getSnapshot().gameId;
  try {
    if (gameId) sessionStorage.setItem(ROOM_MARKER_KEY, gameId);
  } catch {
    // Private mode can refuse storage; the in-memory handle is still enough
    // for same-tab navigation.
  }
}

function forgetActiveRoom(): void {
  try {
    sessionStorage.removeItem(ROOM_MARKER_KEY);
  } catch {
    // ignore
  }
}

/** English, like the other session errors — the join page surfaces it as-is. */
export const LOBBY_CLOSED = 'The host closed the lobby.';

export function expectedRoomGameId(): string | null {
  try {
    return sessionStorage.getItem(ROOM_MARKER_KEY);
  } catch {
    return null;
  }
}

export function activateMultiplayerSession(session: MultiplayerRoomSession): void {
  const store = tabStore();
  const current = store[ACTIVE_ROOM_KEY];
  if (current && current !== session) current.close();
  store[ACTIVE_ROOM_KEY] = session;
  rememberActiveRoom(session);
  for (const listener of activeListeners()) listener();
}

export function getActiveMultiplayerSession(): MultiplayerRoomSession | null {
  return tabStore()[ACTIVE_ROOM_KEY] ?? null;
}

export function subscribeActiveMultiplayerSession(listener: Listener): () => void {
  const listeners = activeListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearActiveMultiplayerSession(): void {
  tabStore()[ACTIVE_ROOM_KEY] = null;
  forgetActiveRoom();
  for (const listener of activeListeners()) listener();
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

/**
 * A room seed is unsigned, and this is the only place that is guaranteed.
 *
 * `| 0` reads a `Uint32Array` slot back as a *signed* int32, so half of every
 * room's seeds were negative — and a negative seed is not a wire value.
 * `isReplaySnapshot` bounds it to 0…0xffffffff, so the `welcome` carrying it
 * was refused as a malformed packet and the guest never adopted the host's
 * deal. Presence carries no seed, so the guest still appeared in the host's
 * lobby, took a seat, and played a deal of its own: one table, two games.
 *
 * It survived a full test suite because every test injects its own positive
 * seed, so nothing ever ran the generator. The normalisation is applied to the
 * injected seed too, so the invariant holds no matter where the number came
 * from.
 */
export function normalizeSeed(seed: number): number {
  return seed >>> 0;
}

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return normalizeSeed(bytes[0]!);
}

/**
 * Narrows the active room's session to a game's own types.
 *
 * This replaces eight exported functions that were the same function with the
 * game id and the type arguments swapped — pure factory tax: adding a game
 * meant adding a ninth copy. The cast is unavoidable (the room holds one
 * session for whichever game is seated) but the id check in front of it is
 * what makes the cast sound, and that check is now written once.
 */
export function multiplayerSession<S, C extends RuleValues>(
  snapshot: MultiplayerRoomSnapshot,
  gameId: string,
): GameSession<S, C> | null {
  return snapshot.gameId === gameId ? (snapshot.session as GameSession<S, C> | null) : null;
}

function stateHolds(state: unknown, handle: string): boolean {
  return stateContainsCardId(state, handle);
}

/**
 * The pack a room's settings name.
 *
 * This used to end in `return createBlitzDef()`. A room announcement arrives
 * over the network from a peer that may be running a different build, so an
 * unrecognised id is exactly the case that must fail — loading some other
 * game's rules for it is the one outcome worse than refusing the room.
 */
function packFor(settings: RoomSettings): RoomGamePack {
  return roomGame(settings.gameId);
}

/**
 * Safari phones report a missing shuffle array as this TypeError. Name the
 * moment instead of putting the engine's words on the lobby.
 */
function startFault(error: unknown, fallback = 'The match could not start'): string {
  const message = error instanceof Error ? error.message : '';
  if (/spread syntax|not (be )?iterable/i.test(message)) {
    return 'This device could not finish the shuffle. Stay here and tap Start again.';
  }
  return message || fallback;
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

/**
 * The strongest tier a game can honestly run — derived, never requested.
 *
 * Nobody chooses this. A pack that ships a veil block and can actually run it
 * hides hands, so its rooms do; anything else plays the open tier with the
 * collaborative deal, and the badge says which is in force. Deriving it from
 * the game rather than reading it off the announcement also means a joining
 * peer computes the same answer as the host from the same game id, so a forged
 * announcement cannot talk a room down into the open tier.
 */
function tierFor(pack: RoomGamePack): RoomSecurity {
  return pack.veilSupport() && !pack.veilRefusal ? 'veil' : 'open';
}

/**
 * Canonicalises a room's settings, or refuses them.
 *
 * The nine-branch chain this replaces restated each pack's config schema, seat
 * rule and Veil stance inline. The registry owns all three now, so this is the
 * policy that applies to every game rather than nine copies of it.
 */
function resolveRoomSettings(settings: RoomSettings): RoomSettings {
  const pack = roomGame(settings.gameId);
  if (!hasValidSeatCount(pack.id, settings.seats)) throw new Error(seatRefusal(pack));
  return {
    gameId: pack.id,
    seats: settings.seats,
    config: pack.resolveConfig(settings.config),
    security: tierFor(pack),
  };
}

function createRoomRuntime(
  settings: RoomSettings,
  seed: number,
  onSeatBot: (seat: number, bot: boolean) => void,
  deckOrder?: readonly string[],
): RoomRuntime {
  return roomGame(settings.gameId).createRuntime({ settings, seed, onSeatBot, deckOrder });
}
