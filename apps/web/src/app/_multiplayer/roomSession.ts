'use client';

import {
  isActingSeat,
  isVeilHandle,
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
  isSeatLeftFault,
  VeilRoom,
  VeilSession,
  type RecoveryPolicy,
  type VeilAuditState,
} from '@/lib/multiplayer/veil';
import { botTurnKey } from './botSeats';
import {
  NostrSignaling,
  type RoomAnnouncement,
  type RoomSignaling,
} from '@/lib/multiplayer/NostrSignaling';
import {
  createDealNonce,
  dealCommitment,
  DealSeedRound,
  rematchDealSeed,
} from '@/lib/multiplayer/dealSeed';
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
  /**
   * The seat this client is holding open, and when the hold expires. The
   * countdown is machine-readable on purpose: the table renders it, and the
   * "carry on without them" control calls {@link resumeWithoutSeat} rather
   * than waiting out the clock.
   */
  waitingOn?: { seat: number; endsAtMs: number } | null;
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
  /**
   * This device failed to produce its deal commitment. Kept separate from
   * `error`, which ordinary traffic clears: a device that cannot hash stays
   * broken until it says otherwise, and the table needs to know which screen
   * to blame.
   */
  dealFault: string | null;
};

type SessionDependencies = {
  /**
   * Signalling for this room. Typed as the interface rather than the Nostr
   * class so a test can supply an in-memory bus: NostrSignaling carries private
   * fields, and TypeScript private members are nominal, so nothing else was
   * assignable to the concrete type however identical its shape.
   */
  signaling?: RoomSignaling;
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
const REMATCH_TIMEOUT_MS = 10_000;

/**
 * How long a veiled round holds a seat open for a player who dropped.
 *
 * The old value was 45 seconds, chosen to make waiting the path of least
 * resistance — but four people staring at a frozen table because one phone
 * locked its screen is a worse outcome than the privacy the long wait buys.
 * Twelve seconds still covers a radio handoff and an app switch, the hold is
 * now announced with a countdown ({@link MultiplayerSecurity.waitingOn}), and
 * any seat can end it early via {@link resumeWithoutSeat} instead of sitting
 * through the clock. When the hold does expire, recovery at three or more
 * seats opens only the dropped hand; at two, it is a walkover.
 */
export const RECONNECT_GRACE_MS = 12_000;

/**
 * Opening a room takes no privacy tier by default, because nobody has asked
 * for one yet: {@link tierFor} answers open until the shipped default flips.
 * A caller — today only tests; eventually the create screen — may request
 * `security: 'veil'` explicitly, and {@link resolveRoomSettings} honors it
 * exactly when the pack can run it.
 */
type CreateRoomOptions = {
  seats: number;
  gameId?: MultiplayerGameId;
  config?: RuleValues;
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
    waitingOn: null,
  };
}

/**
 * Signalling injected by an end-to-end test, or null.
 *
 * The multi-context browser suite runs each seat in its own page, so no shared
 * JS object can serve them — the bus lives in the Node process and each page
 * reaches it through this global. Without a seam the suite has to talk to the
 * public Nostr relays it is meant to be independent of, which is exactly why it
 * spent a day failing on relay availability rather than on Parlour.
 *
 * This is a production code path, and that is stated rather than hidden: the
 * global is readable in the shipped bundle. It grants nothing new, because
 * script running in this page can already read every hand, send any move and
 * replace the transport outright — an attacker who can set this global has
 * already won by every other route. What it must never become is a way to
 * reach signalling from *outside* the page, so it stays a same-realm global
 * with no message, storage or URL channel behind it.
 */
function injectedSignaling(): RoomSignaling | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { __PARLOUR_E2E_SIGNALING__?: unknown })
    .__PARLOUR_E2E_SIGNALING__;
  return candidate !== null && typeof candidate === 'object' && 'publicKey' in candidate
    ? (candidate as RoomSignaling)
    : null;
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
  /** A reveal arrived before this client finished attaching its local seat. */
  private dealRevealStarted = false;
  private sequence = 0;
  private recycleActionPending = false;
  /** A no-match jump-in is declined from here, so it cannot re-enter send. */
  private autoDeclinePending = false;
  /** a veiled redeal ceremony already under way, so it cannot start twice */
  private redealPending = false;
  /**
   * Next epoch number to hand out, never reused.
   *
   * Both the next-hand ceremony and a mid-hand stock recycle used to derive
   * their epoch from `liveEpochs()` at the top of the call and then await
   * `startRecycle`. That leaves a window where two ceremonies read the same
   * highest epoch and both claim it. It never mattered while the next hand was
   * only shuffled on demand — nothing else was in flight — and it matters now
   * that the next hand is shuffled ahead of time, while a hand is still being
   * played and can still recycle its stock.
   */
  private epochCursor = 0;
  /**
   * A ceremony run before the hand that needs it.
   *
   * The whole point: a ceremony costs one to three seconds, and a hand takes
   * tens of seconds to play. Run it during the hand and the next deal is
   * already sitting there when the hand ends, so the cost is never on a path a
   * player is waiting on. `participants` is captured because a seat that drops
   * between priming and dealing takes its layer with it — that run is spent,
   * and the deal falls back to shuffling on demand.
   */
  private primedDeck: {
    participants: readonly number[];
    deck: Promise<readonly string[]>;
  } | null = null;
  private openPending = false;
  /** One host deal at a time when players leave the podium together. */
  private rematchPending = false;
  /**
   * Commitments THIS seat failed to produce, keyed by seat.
   *
   * A swallowed failure here used to be reported ten seconds later as an
   * innocent peer "never mixing the shuffle". Recording the real error keeps
   * the timeout message able to name the device that actually broke.
   */
  private readonly localDealFaults = new Map<SeatId, string>();
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
    dealFault: null,
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
      security: options.security,
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
    const signaling = this.dependencies.signaling ?? injectedSignaling() ?? new NostrSignaling();
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
      // The host can finish seating us before this join continuation runs. In
      // that ordering the earlier presence event could not identify our local
      // seat, so publish the commitment again now that both room and seat are
      // available.
      this.commitDealShare();
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
    activateMultiplayerSession(this);
    if (this.snapshot.seats.length < (this.snapshot.settings?.seats ?? 2)) {
      const error = new Error('every seat must be filled before the match starts');
      this.update({ error: startFault(error) });
      throw error;
    }
    try {
      if (this.snapshot.security.tier === 'veil') {
        // A veiled deal takes its unpredictability from the ceremony itself —
        // every shuffling seat lays a layer on a deck nobody can read — so it
        // needs no separate seed round, and it publishes the real position at
        // the end.
        //
        // House bots no longer force this room onto open play. They hold no key
        // and sit the ceremony out; the humans still each hold a layer, so no
        // single player can read the deck, and the host opens a bot's hand to
        // play it exactly as it already did.
        await this.dealVeiled();
      } else {
        // An open room had no "the host dealt" signal at all, which is why a
        // guest used to be pushed onto the table the moment it was seated. The
        // deal is rebuilt on the seed every seat mixed, then published: the same
        // snapshot a veiled deal sends, and peers adopt an unsolicited one only
        // while their own log is still empty, so it opens the table for everyone
        // without being able to rewrite a round in progress.
        await this.dealOpen();
      }
      this.transport?.holdLobby(false);
      this.update({ stage: 'table', error: null });
    } catch (error) {
      this.update({ error: startFault(error) });
      throw error;
    }
  }

  /**
   * Deals another match without replacing the room, code, seats or peers.
   *
   * A guest asks the current host and waits for the signed room state to move
   * to a fresh seed. The host derives that seed from the completed shared deal
   * and state hash, so it cannot keep rerolling the next deck to suit itself.
   */
  async rematch(): Promise<void> {
    const transport = this.transport;
    const current = this.snapshot.session;
    if (!transport || !current || this.snapshot.connection === 'closed') {
      throw new Error('the table is no longer connected');
    }
    if (current.status !== 'ended' || !current.result) {
      if (current.status === 'playing') return;
      throw new Error('the current match has not finished yet');
    }

    if (this.snapshot.isHost) {
      await this.beginRematch();
      return;
    }

    const previousSeed = current.seed;
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('the host did not answer the rematch request'));
      }, REMATCH_TIMEOUT_MS);
      unsubscribe = this.subscribe(() => {
        const next = this.snapshot.session;
        if (!next || next.seed === previousSeed || next.status !== 'playing') return;
        if (timer) clearTimeout(timer);
        unsubscribe();
        resolve();
      });
    });
    try {
      transport.requestRematch();
    } catch (error) {
      if (timer) clearTimeout(timer);
      unsubscribe();
      throw error;
    }
    await ready;
  }

  private async beginRematch(): Promise<void> {
    if (this.rematchPending) return;
    const settings = this.snapshot.settings;
    const code = this.snapshot.room?.code;
    const current = this.authority?.exportSnapshot();
    if (!settings || !code || !current || !this.authority || !this.transport) {
      throw new Error('the table is no longer ready for a rematch');
    }
    const live = this.authority.getSession();
    if (live.status !== 'ended' || !live.result) return;

    this.rematchPending = true;
    try {
      const seed = await rematchDealSeed(code, current.seed, current.stateHash);
      const runtime = createRoomRuntime(settings, seed, (seat, bot) =>
        this.acceptSeatBot(seat, bot),
      );
      await this.authority.importSnapshot(runtime.authority.exportSnapshot());
      this.seed = seed;
      this.scheduledBotTurns.clear();
      this.recycleActionPending = false;
      this.autoDeclinePending = false;
      this.redealPending = false;
      this.openPending = false;
      this.transport.publishRematch();
      this.update({
        session: this.presented(this.authority.getSession()),
        fx: runtime.session.setupFx ?? [],
        fxKey: this.snapshot.fxKey + 1,
        stage: 'table',
        error: null,
        security: securityFor('open', settings.seats, 'open'),
      });
      this.driveBotSeats();
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : 'The rematch could not be dealt',
      });
      throw error;
    } finally {
      this.rematchPending = false;
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
    this.dealRevealStarted = true;
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
        this.localDealFaults.delete(seat as SeatId);
        if (this.snapshot.dealFault) this.update({ dealFault: null });
        this.dealRound.recordCommitment(seat as SeatId, commit);
        this.transport?.sendDeal({ type: 'deal.commit', commit });
        // A fast host may have opened the reveal phase while this commitment
        // was still hashing. Do not make it repeat Start: answer the reveal as
        // soon as this seat is ready.
        if (this.dealRevealStarted) this.revealDealShare();
      })
      .catch((error: unknown) => {
        // A commitment this seat could not produce is THIS seat's fault, and
        // saying nothing about it lets the deal timeout name an innocent peer
        // ten seconds later. Record the failure where waitForDealShares can
        // tell "your own device could not mix" apart from "a seat stopped
        // answering", because only one of those is somebody else's problem.
        const reason = error instanceof Error ? error.message : 'the shuffle could not be mixed';
        this.localDealFaults.set(seat as SeatId, reason);
        // Say so on this device now — the deal timeout would otherwise be the
        // first anyone here heard of it, ten seconds later and worded as if a
        // peer were at fault. Its own slot because `error` is cleared by
        // every accepted packet.
        this.update({
          dealFault: `This device could not mix the shuffle (${reason})`,
        });
      });
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
        const local = new Map(
          [...this.localDealFaults].filter(([seat]) => missing.includes(`Seat ${seat + 1}`)),
        );
        const localNames = [...local.keys()].map((seat) => `Seat ${seat + 1}`);
        const reasons = [...new Set([...local.values()])].join('; ');
        if (local.size > 0 && missing.every((name) => localNames.includes(name))) {
          throw new Error(
            `${localNames.join(' and ')} could not mix the shuffle on this device (${reasons}). ` +
              'The deal cannot start from here.',
          );
        }
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

    // House bots hold no key and cannot shuffle, so they sit the ceremony out.
    // The host opens their hands to play them either way, which is the same
    // deal an open table already makes — and the humans still each hold a layer,
    // so no single player can read the deck.
    const laying = this.ceremonySeats();
    if (laying.length === 0) throw new Error('no seat at this table can shuffle');
    veil.room.setParticipants(laying);

    await waitForVeilKeys(veil.room);
    await veil.room.publishHeader(support.deck(settings.config).cardIds);
    await veil.room.advanceCeremony();
    await waitForCeremony(veil.session, 0, laying.length, () => this.publishCeremonyProgress());

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
    // A pack that declares Veil but exposes every card is a misconfiguration,
    // not a mode: the table would look normal while hiding nothing. Fail the
    // deal loudly instead of publishing it.
    const dealt = runtime.authority.getSession();
    const hidden = dealt.state
      ? Array.from({ length: settings.seats }, (_, seat) =>
          roomGame(settings.gameId).privateHandles(dealt.state, seat),
        ).reduce((count, hand) => count + hand.length, 0)
      : 0;
    if (hidden === 0) {
      throw new Error(`${settings.gameId} declared a veiled deal but hid no cards`);
    }
    this.authority!.importSnapshot(runtime.authority.exportSnapshot());
    this.transport.publishSnapshot();
    this.update({
      session: this.presented(this.authority!.getSession()),
      fx: runtime.session.setupFx ?? [],
      fxKey: this.snapshot.fxKey + 1,
      security: {
        ...this.snapshot.security,
        ceremony: { laid: laying.length, seats: laying.length, ready: true },
      },
    });
    void this.openMyHandles();
    this.primeNextHand();
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
    // Already shuffled during the hand that just ended, unless the table
    // changed shape underneath it — in which case shuffle now, as before.
    const deck = this.takePrimedDeck() ?? this.shuffleNextHand();
    void deck
      .then((deckOrder) => this.inject(move, { deckOrder }))
      .then(() => this.primeNextHand())
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
  /** Hands out a fresh epoch, monotonic even while another ceremony is in flight. */
  private allocateEpoch(): number {
    const live = this.veil?.session.liveEpochs() ?? [];
    const highest = live.length > 0 ? Math.max(...live) : -1;
    this.epochCursor = Math.max(this.epochCursor, highest + 1);
    return this.epochCursor++;
  }

  /** Seats that can lay a layer: connected, and not a bot holding no key. */
  private ceremonySeats(): number[] {
    return this.snapshot.seats
      .filter((seat) => seat.connected && !seat.bot)
      .map((seat) => seat.seat)
      .sort((left, right) => left - right);
  }

  /**
   * Starts the next hand's ceremony now, while this hand is still being played.
   *
   * Failure is deliberately swallowed: a primed run is an optimisation, and the
   * on-demand path is still there to shuffle when the hand actually ends. What
   * must never happen is a rejected background promise taking the match with it.
   */
  private primeNextHand(): void {
    if (!this.snapshot.isHost || !this.veil || this.primedDeck) return;
    const settings = this.snapshot.settings;
    if (!settings || !roomGame(settings.gameId).redealMove) return;
    const participants = this.ceremonySeats();
    if (participants.length === 0) return;

    const deck = this.shuffleNextHand(participants);
    deck.catch(() => undefined);
    this.primedDeck = { participants, deck };
  }

  /** The primed deck when it is still valid for the seats now at the table. */
  private takePrimedDeck(): Promise<readonly string[]> | null {
    const primed = this.primedDeck;
    this.primedDeck = null;
    if (!primed) return null;
    const now = this.ceremonySeats();
    const same =
      primed.participants.length === now.length &&
      primed.participants.every((seat, index) => seat === now[index]);
    return same ? primed.deck : null;
  }

  private async shuffleNextHand(seats?: readonly number[]): Promise<readonly string[]> {
    const veil = this.veil;
    const settings = this.snapshot.settings;
    if (!veil || !settings) throw new Error('this room is not running Veil');
    const support = roomGame(settings.gameId).veilSupport();
    if (!support) throw new Error(`${settings.gameId} cannot run a veiled room`);

    const epoch = this.allocateEpoch();
    const participants = seats ?? this.ceremonySeats();
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
    const epoch = this.allocateEpoch();
    const participants = this.ceremonySeats();
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
    // Authority still holds handles. The presented snapshot has already
    // overlaid this seat's faces, so looking for a handle there would skip
    // every opening a peeled playCard actually needs — and the engine would
    // refuse the move as illegal until the turn clock drew instead.
    const state = this.authority?.getSession().state ?? this.snapshot.session?.state;
    if (!veil || !state) return {};
    const wanted = new Set<string>(extra ?? []);
    const named = (payload as { card?: unknown } | null | undefined)?.card;
    if (typeof named === 'string') wanted.add(named);
    if (wanted.size === 0) return {};

    const known = veil.session.knownFaces();
    const liveByCard = new Map<string, string>();
    for (const [handle, card] of known) {
      // Recycle leaves stale handle→face rows behind. Only a handle still on
      // the board can be opened; the last retired mapping would skip the live
      // one and the engine would refuse a perfectly legal playCard.
      if (stateHolds(state, handle)) liveByCard.set(card, handle);
    }
    const reveals: (readonly [string, string])[] = [];
    for (const card of wanted) {
      if (isVeilHandle(card) && stateHolds(state, card)) {
        const face = known.get(card);
        if (face) reveals.push([card, face]);
        continue;
      }
      if (stateHolds(state, card) && !isVeilHandle(card)) continue;
      const handle = liveByCard.get(card);
      if (handle) reveals.push([handle, card]);
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
          if (this.snapshot.session?.result) return;
          if (isSeatLeftFault(error)) {
            const departed = this.departedHumanSeat();
            if (departed !== null && this.shouldWalkover(departed)) this.awardWalkover(departed);
            return;
          }
          this.update({
            error: error instanceof Error ? error.message : 'A card could not be opened',
          });
        }
      }),
    );
  }

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
   *
   * Two seats have no honest recovery: the only other player is the opponent.
   * After the grace, that is a walkover, not a pause about key material.
   */
  private awaitReturnThenRecover(seat: number): void {
    if (this.pendingReturns.has(seat)) return;
    // Marked gone now, recovered later. A seat only offers its share of a
    // missing layer for a seat it agrees has gone, so if each peer waited out
    // its own hold before agreeing, whoever asked first would be asking peers
    // that had not noticed yet and would collect nothing. Noticing is driven by
    // presence, which every peer sees; the hold only delays acting on it.
    this.veil?.room.markSeatLost(seat);
    const graceMs = this.dependencies.reconnectGraceMs ?? RECONNECT_GRACE_MS;
    this.update({
      security: {
        ...this.snapshot.security,
        paused: `Seat ${seat + 1} dropped. Waiting for them to come back…`,
        waitingOn: { seat, endsAtMs: Date.now() + graceMs },
      },
    });
    const timer = setTimeout(() => {
      this.pendingReturns.delete(seat);
      this.resumeWithoutSeat(seat);
    }, graceMs);
    this.pendingReturns.set(seat, timer);
  }

  /**
   * Ends the hold on a dropped seat now instead of at the clock.
   *
   * This is the "carry on without them" control the countdown names. Recovery
   * at three or more seats rebuilds the departed layer out of other seats'
   * shares — a real privacy loss, stated where it happens — and at two it is a
   * walkover, because the only other player is the opponent and nobody should
   * get a cryptography lecture instead of a result. Every peer runs its own
   * copy on its own clock; one seat calling this never forces another peer to
   * disclose anything that peer's own hold was still protecting.
   */
  resumeWithoutSeat(seat: number): void {
    const timer = this.pendingReturns.get(seat);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingReturns.delete(seat);
      if (this.shouldWalkover(seat)) {
        this.awardWalkover(seat);
        return;
      }
    }
    void this.recoverLostSeat(seat);
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
    if (this.snapshot.security.waitingOn?.seat === seat) {
      this.update({
        security: { ...this.snapshot.security, paused: null, waitingOn: null },
      });
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
      security: { ...this.snapshot.security, paused: null, waitingOn: null },
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
        waitingOn:
          this.snapshot.security.waitingOn?.seat === seat ? null : this.snapshot.security.waitingOn,
        paused: recovered
          ? null
          : veil.session.recovery.mode === 'none'
            ? null
            : `Waiting for more players before the round can continue.`,
      },
    });
    if (recovered) {
      void this.openMyHandles();
      if (this.snapshot.isHost) {
        void this.openSeatHandles(seat).then(() => this.driveBotSeats());
      }
      return;
    }
    if (this.shouldWalkover(seat)) this.awardWalkover(seat);
  }

  /** The only remaining human should just win — not sit in a cryptography lecture. */
  private shouldWalkover(departedSeat: number): boolean {
    const humans = this.snapshot.seats.filter((seat) => !seat.bot);
    if ((this.snapshot.settings?.seats ?? humans.length) <= 2) return true;
    const remaining = humans.filter((seat) => seat.seat !== departedSeat && seat.connected);
    return remaining.length <= 1;
  }

  private departedHumanSeat(): number | null {
    const gone = this.snapshot.seats.find((seat) => !seat.bot && !seat.connected);
    return gone?.seat ?? null;
  }

  private awardWalkover(departedSeat: number): void {
    const session = this.snapshot.session;
    if (!session || session.result) return;
    const winner =
      this.snapshot.seats.find((seat) => seat.seat !== departedSeat && !seat.bot)?.seat ??
      this.snapshot.localSeat;
    if (winner === null) return;
    this.update({
      session: {
        ...session,
        status: 'ended',
        result: {
          winner,
          rankings: this.snapshot.seats.map((seat) => ({
            seat: seat.seat,
            rank: seat.seat === winner ? 1 : 2,
          })),
          reason: 'opponent-left',
        },
        phase: { ...session.phase, actor: null },
      },
      error: null,
      security: { ...this.snapshot.security, paused: null, waitingOn: null },
    });
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
    this.maybeAutoDeclineJump();
  }

  /**
   * Veil jump-in is offered to every seat because the table cannot see hands.
   * Once this seat has peeled and has no exact match, decline here — do not
   * leave a "jump in?" prompt, and do not let a colour-match playCard land
   * while the window is still open (that is the illegal-move the table printed).
   */
  private maybeAutoDeclineJump(): void {
    if (
      this.autoDeclinePending ||
      !this.authority ||
      !this.transport ||
      this.snapshot.localSeat === null ||
      this.snapshot.security.paused
    ) {
      return;
    }
    const session = this.presented(this.authority.getSession());
    if (session.status !== 'playing' || session.phase.actor !== this.snapshot.localSeat) return;
    const legal = session.def.flow.legalMoves(session.state as never, session.phase);
    if (!legal.some((move) => move.id === 'declineJump')) return;
    if (legal.some((move) => move.id === 'playCard')) return;
    if (seatHandStillVeiled(session.state, this.snapshot.localSeat)) return;
    this.autoDeclinePending = true;
    try {
      this.send('declineJump');
    } finally {
      this.autoDeclinePending = false;
    }
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

  private prepare(settings: RoomSettings, signaling?: RoomSignaling): void {
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
      signaling: signaling ?? this.dependencies.signaling ?? injectedSignaling() ?? undefined,
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
      this.dealRevealStarted = true;
      this.dealRound.recordContribution(seat, message.nonce);
      // Somebody has opened the reveal phase, so answer with this seat's share.
      // The host reveals first when it deals; everyone else follows from here,
      // which closes the round in a single round trip.
      this.revealDealShare();
    });
    this.transport.onSnapshot((notification) => {
      // The host published the opening position, so adopt it — and check the
      // deal inside it is the one the table's shares add up to.
      const imported = this.authority!.exportSnapshot();
      const openDeal = imported.settings.security !== 'veil';
      this.update({
        session: this.presented(this.authority!.getSession()),
        fx: this.authority!.getSession().setupFx ?? [],
        fxKey: this.snapshot.fxKey + 1,
        stage: 'table',
        localSeat: this.snapshot.localSeat ?? this.seatForLocalProfile(),
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
      if (notification.reason !== 'rematch') this.verifyPublishedDeal();
      void this.openMyHandles();
    });
    this.transport.onRematchRequest(() => {
      if (this.snapshot.isHost) void this.beginRematch().catch(() => undefined);
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
    this.maybeAutoDeclineJump();
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
      else if (this.shouldWalkover(presence.seat)) this.awardWalkover(presence.seat);
      else this.driveBotSeats();
    }
  }

  private seatForLocalProfile(): number | null {
    return (
      this.snapshot.seats.find((seat) => seat.profileId === this.profile.profileId)?.seat ?? null
    );
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

function seatHandStillVeiled(state: unknown, seat: number): boolean {
  if (typeof state !== 'object' || state === null || !('hands' in state)) return false;
  const hands = (state as { hands?: unknown }).hands;
  if (!Array.isArray(hands)) return false;
  const mine = hands[seat];
  return Array.isArray(mine) && mine.some((card) => isVeilHandle(card));
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
 * Friend rooms play the engine's open rules by default.
 *
 * Veil is a full protocol in the tree — packs ship veil blocks and the
 * ceremony is tested end to end — but {@link tierFor} still answers open, so
 * no shipped room runs it yet. A requested tier travels with the settings:
 * create passes what its caller asked for, join passes the host's
 * announcement, and both ends resolve it through this one function. A tier is
 * honored only when the pack can actually run it, so host and guest compute
 * the same answer from the same game id — an announcement cannot talk a room
 * into a tier the pack does not support.
 */
function tierFor(): RoomSecurity {
  return 'open';
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
    security: settings.security === 'veil' && pack.veilSupport() !== null ? 'veil' : tierFor(),
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
