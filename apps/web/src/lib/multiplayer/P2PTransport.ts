import {
  createRoomCode,
  resolveRoomShareOrigin,
  roomJoinUrl,
  validateRoomCode,
} from '../rooms/code';
import { seatRangeFor } from '../rooms/seatRange';
import {
  NostrSignaling,
  type RoomAnnouncement,
  type RoomSignaling,
  type SignalPayload,
} from './NostrSignaling';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MultiplayerState,
  houseBotPeerId,
  houseBotProfile,
  validatePresenceSnapshot,
} from './resilience';
import { canPublishListings, type RoomListingPublisher } from './RoomDirectory';
import { validateEmote } from './emotes';
import { DEFAULT_ICE_SERVERS } from './iceServers';
import { DuplicateActionError, MoveRefusedError } from './EngineAuthority';
import {
  dispatchWireData,
  type DealMessage,
  type PeerDescriptor,
  type WireMessage,
} from './wireSchema';
import { stateHash, type SeatId } from '@parlour/engine';
import { rematchDealSeed } from './dealSeed';
import type { VeilMessage } from './veil/wire';
import type {
  AppliedPacket,
  AuthorityAdapter,
  Emote,
  MigrationSnapshot,
  PlayerAction,
  PlayerProfile,
  PresenceSnapshot,
  PresenceEvent,
  RoomHandle,
  RoomSettings,
  SnapshotNotification,
  Transport,
} from './types';

/** How long to wait before redialling a peer whose connection died. */
const REDIAL_DELAY_MS = 1_000;
/** Redials before a peer is treated as genuinely gone rather than flaky. */
const MAX_REDIALS = 3;

type PeerLink = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  pendingIce: RTCIceCandidateInit[];
  /** DataChannels are ordered, so async packet handling must stay ordered too. */
  inbox: Promise<void>;
  profileId?: string;
};

type P2PTransportOptions = {
  authority: AuthorityAdapter;
  profileId: string;
  profileName?: string;
  profileAvatarId?: string;
  signaling?: RoomSignaling;
  iceServers?: RTCIceServer[];
  origin?: string;
  now?: () => number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  randomBytes?: (length: number) => Uint8Array;
  peerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
};

export class P2PTransport implements Transport {
  private readonly authority: AuthorityAdapter;
  private readonly profileId: string;
  private readonly profile: PlayerProfile;
  private readonly signaling: RoomSignaling;
  private readonly iceServers: RTCIceServer[];
  private readonly origin: string;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly peerConnection: (configuration: RTCConfiguration) => RTCPeerConnection;
  private readonly links = new Map<string, PeerLink>();
  private readonly profiles = new Map<string, PlayerProfile>();
  private readonly eventListeners = new Set<(event: AppliedPacket) => void>();
  private readonly snapshotListeners = new Set<(notification: SnapshotNotification) => void>();
  private readonly presenceListeners = new Set<(event: PresenceEvent) => void>();
  private readonly emoteListeners = new Set<(peerId: string, emote: Emote) => void>();
  private readonly veilListeners = new Set<(peerId: string, message: VeilMessage) => void>();
  private readonly dealListeners = new Set<(seat: SeatId, message: DealMessage) => void>();
  private readonly rematchListeners = new Set<(seat: SeatId) => void>();
  private readonly refusalListeners = new Set<(action: PlayerAction, code: string) => void>();
  private readonly lastReceivedEmote = new Map<string, number>();
  /** Redials spent on a peer since it last held an open channel. */
  private readonly redials = new Map<string, number>();
  private readonly redialTimers = new Set<ReturnType<typeof setTimeout>>();
  private resilience?: MultiplayerState;
  private roomCode?: string;
  private signalSubscription?: { close(): void };
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private lastEmoteAt = -Infinity;
  private pendingResync = false;
  private pendingHostMigration = false;
  private closed = false;
  private systemSequence = 0;
  /**
   * While the room is still seating, a vanished host closes the lobby instead
   * of electing a replacement, and a vanished guest frees their chair.
   */
  private lobbyHold = true;

  constructor(options: P2PTransportOptions) {
    this.authority = options.authority;
    this.profileId = options.profileId;
    this.profile = {
      profileId: options.profileId,
      name: options.profileName?.trim().slice(0, 32) || 'Player',
      avatarId: options.profileAvatarId?.trim().slice(0, 128) || 'ember',
    };
    this.signaling = options.signaling ?? new NostrSignaling();
    this.iceServers = options.iceServers ?? DEFAULT_ICE_SERVERS;
    this.origin =
      options.origin ??
      resolveRoomShareOrigin(window.location.origin, process.env.NEXT_PUBLIC_PARLOUR_SHARE_ORIGIN);
    this.now = options.now ?? (() => Date.now());
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    this.randomBytes =
      options.randomBytes ??
      ((length) => {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return bytes;
      });
    this.peerConnection =
      options.peerConnection ?? ((configuration) => new RTCPeerConnection(configuration));
  }

  async create(settings: RoomSettings): Promise<RoomHandle> {
    this.assertOpen();
    const { min, max } = seatRangeFor(settings.gameId);
    if (!Number.isInteger(settings.seats) || settings.seats < min || settings.seats > max) {
      throw new Error(`rooms require ${min}–${max} seats for ${settings.gameId}`);
    }
    const code = createRoomCode(this.randomBytes);
    await this.signaling.announce(code, settings);
    this.startRoom(code, this.signaling.publicKey);
    this.resilience?.assignSeat(0, this.signaling.publicKey, this.profileId);
    this.profiles.set(this.signaling.publicKey, this.profile);
    return this.handle(code);
  }

  async join(
    rawCode: string,
    resolvedRoom?: RoomAnnouncement,
    expectedHost?: string,
  ): Promise<RoomHandle> {
    this.assertOpen();
    const verdict = validateRoomCode(rawCode);
    if (!verdict.ok) throw new Error('Room codes use four unambiguous letters or digits');
    const { code } = verdict;
    this.emitPresence({ kind: 'connection', state: 'connecting' });
    const room = resolvedRoom ?? (await this.signaling.resolve(code, expectedHost));
    if (expectedHost !== undefined && room.hostPubkey !== expectedHost) {
      throw new Error('Room announcement does not match the invited host');
    }
    this.startRoom(code, room.hostPubkey);
    await this.connect(room.hostPubkey, true);
    return this.handle(code);
  }

  send(action: PlayerAction): void {
    this.assertReady();
    if (!action.id || !Number.isInteger(action.seat) || !action.move) {
      throw new Error('invalid player action');
    }
    if (this.seatForPeer(this.signaling.publicKey) !== action.seat) {
      throw new Error('action seat does not belong to this profile');
    }
    this.resilience?.trackPending(action);
    if (this.isHost()) void this.applyAsHost(action);
    else this.sendTo(this.resilience!.hostId, { type: 'intent', action });
  }

  /**
   * Submits a move on behalf of a seat a bot has taken over.
   *
   * Authorised narrowly: only the host, and only for a seat the presence layer
   * has actually marked as a bot. That is what keeps this from being a way to
   * play someone else's turn — a seat with a live peer behind it is refused
   * even to the host.
   */
  sendAsBot(action: PlayerAction): void {
    this.assertReady();
    if (!this.isHost()) throw new Error('only the host authority may play a bot seat');
    const occupant = this.resilience!.seats.get(action.seat);
    if (!occupant?.bot) throw new Error(`seat ${action.seat} is not being played by a bot`);
    void this.applyAsHost(action);
  }

  inject(move: string, payload?: unknown, reveals?: readonly (readonly [string, string])[]): void {
    this.assertReady();
    if (!this.isHost()) throw new Error('only the host authority may inject system events');
    if (!this.authority.inject) throw new Error('this game authority does not accept injection');
    const actionId = `system:${this.signaling.publicKey}:${this.systemSequence++}`;
    void this.applySystemAsHost(actionId, move, payload, reveals);
  }

  sendEmote(emote: Emote): boolean {
    const verdict = validateEmote(emote, this.lastEmoteAt, this.now);
    if (!verdict.ok) return false;
    this.lastEmoteAt = verdict.sentAt;
    this.broadcast({ type: 'emote', emote });
    this.emitEmote(this.signaling.publicKey, emote);
    return true;
  }

  onEvent(callback: (event: AppliedPacket) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  onSnapshot(callback: (notification: SnapshotNotification) => void): () => void {
    this.snapshotListeners.add(callback);
    return () => this.snapshotListeners.delete(callback);
  }

  requestRematch(): void {
    this.assertReady();
    const seat = this.seatForPeer(this.signaling.publicKey);
    if (seat === null) throw new Error('your seat is not connected');
    if (this.isHost()) {
      for (const listener of this.rematchListeners) listener(seat);
      return;
    }
    this.sendTo(this.resilience!.hostId, { type: 'rematch.request' });
  }

  onRematchRequest(callback: (seat: SeatId) => void): () => void {
    this.rematchListeners.add(callback);
    return () => this.rematchListeners.delete(callback);
  }

  onPresence(callback: (presence: PresenceEvent) => void): () => void {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  onEmote(callback: (peerId: string, emote: Emote) => void): () => void {
    this.emoteListeners.add(callback);
    return () => this.emoteListeners.delete(callback);
  }

  /**
   * Veil traffic rides the same mesh as everything else. `to` addresses one
   * peer for a private peel; null broadcasts a ceremony step to the room.
   */
  sendVeil(message: VeilMessage, to: string | null = null): void {
    this.assertReady();
    const envelope: WireMessage = { type: 'veil', to: to ?? null, message };
    if (to === null) this.broadcast(envelope);
    else this.sendTo(to, envelope);
  }

  onVeil(callback: (peerId: string, message: VeilMessage) => void): () => void {
    this.veilListeners.add(callback);
    return () => this.veilListeners.delete(callback);
  }

  /**
   * Host-only signal: the engine said no to a player action.
   *
   * Refusals are ordinarily silent — a tap that raced the position and lost.
   * But some refusals are also a REQUEST the room should hear: a veiled draw
   * refused for want of a re-veiled stock is a seat saying "I need the
   * ceremony you have not run yet", and it may be the only message that seat
   * can produce while it is blocked. The room listens and answers; nothing
   * here reaches the screen.
   */
  onRefusal(callback: (action: PlayerAction, code: string) => void): () => void {
    this.refusalListeners.add(callback);
    return () => this.refusalListeners.delete(callback);
  }

  /** Broadcasts this seat's shuffle commitment or the share behind it. */
  sendDeal(message: DealMessage): void {
    this.assertReady();
    this.broadcast(message);
  }

  /**
   * Shuffle shares, already attributed to the seat that actually sent them.
   *
   * The seat comes from the mesh's own view of who is speaking, never from the
   * packet, so a peer cannot contribute on somebody else's behalf.
   */
  onDeal(callback: (seat: SeatId, message: DealMessage) => void): () => void {
    this.dealListeners.add(callback);
    return () => this.dealListeners.delete(callback);
  }

  /** Seat/peer lookup the Veil ceremony needs to address a single seat. */
  peerIdForSeat(seat: SeatId): string | null {
    const occupant = this.resilience?.seats.get(seat);
    return occupant && !occupant.bot ? occupant.peerId : null;
  }

  /**
   * The directory this room can advertise itself through, or null.
   *
   * Null is an ordinary answer, not a failure: the hermetic test bridge signals
   * fine and lists nothing, and a host on that build simply cannot make its
   * table public. The room session treats it as "the toggle does nothing here"
   * rather than as an error to show anyone.
   */
  listingPublisher(): RoomListingPublisher | null {
    return canPublishListings(this.signaling) ? this.signaling : null;
  }

  seatForPeerId(peerId: string): SeatId | null {
    return this.resilience ? this.seatForPeer(peerId) : null;
  }

  /**
   * Host-only: replaces the room's starting position for everyone.
   *
   * The Veil ceremony cannot run until every seat is present, so a veiled room
   * sits in the lobby on a placeholder deal and swaps in the real one once the
   * shuffle closes. Peers accept an unsolicited snapshot only while their own
   * log is still empty, so this can never rewrite a round in progress.
   */
  publishSnapshot(): void {
    this.assertReady();
    if (!this.isHost()) throw new Error('only the host may publish a starting position');
    this.broadcast({ type: 'sync.snapshot', snapshot: this.exportMigration() });
  }

  publishRematch(): void {
    this.assertReady();
    if (!this.isHost()) throw new Error('only the host may publish a rematch');
    this.broadcast({ type: 'rematch.start', snapshot: this.exportMigration() });
  }

  /** Match has started — host loss elects, guest loss becomes a bot. */
  holdLobby(hold: boolean): void {
    this.lobbyHold = hold;
  }

  /** Host is leaving the lobby: tell everyone before the channels go down. */
  announceClosed(): void {
    if (this.closed) return;
    this.broadcast({ type: 'room.closed' });
  }

  /** Host-only: fill an empty lobby chair with a house bot. */
  seatBot(seat: number): void {
    this.assertReady();
    if (!this.isHost()) throw new Error('only the host can seat a bot');
    if (!this.lobbyHold) throw new Error('bots can only be seated in the lobby');
    const profile = houseBotProfile(seat);
    this.resilience!.assignBotSeat(seat);
    this.profiles.set(houseBotPeerId(seat), profile);
    this.authority.setSeatBot(seat, true);
    this.broadcastPresence();
    this.emitPresence({
      kind: 'peer.joined',
      peerId: houseBotPeerId(seat),
      seat,
      profile,
      bot: true,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.redialTimers) clearTimeout(timer);
    this.redialTimers.clear();
    this.signalSubscription?.close();
    for (const link of this.links.values()) link.pc.close();
    this.links.clear();
    this.signaling.close();
    this.emitPresence({ kind: 'connection', state: 'closed' });
  }

  private startRoom(code: string, hostId: string): void {
    this.roomCode = code;
    this.resilience = new MultiplayerState(this.signaling.publicKey, hostId);
    this.resilience.seePeer(this.signaling.publicKey, this.now());
    this.signalSubscription = this.signaling.subscribe(code, (sender, signal) => {
      void this.receiveSignal(sender, signal);
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatIntervalMs);
  }

  private handle(code: string): RoomHandle {
    return {
      code,
      peerId: this.signaling.publicKey,
      hostId: this.resilience!.hostId,
      shareUrl: roomJoinUrl(this.origin, code, this.signaling.publicKey),
      close: () => this.close(),
    };
  }

  /**
   * Forgets a dead peer connection so the mesh is free to dial it again.
   *
   * Guarded on identity, because a link that has already been replaced by a
   * newer dial must not be torn down by its predecessor's late state change.
   * Only one end redials — the same convention `connectMesh` uses to pick an
   * offerer — or the two offers collide. A guest always redials the host,
   * mirroring the dial it made to join. Attempts are capped so a peer that has
   * genuinely left does not have its chair rung forever.
   */
  private retire(peerId: string, pc: RTCPeerConnection): void {
    if (this.closed) return;
    const link = this.links.get(peerId);
    if (!link || link.pc !== pc) return;
    this.links.delete(peerId);
    link.pc.close();

    const spent = this.redials.get(peerId) ?? 0;
    const dials =
      peerId === this.resilience?.hostId ? !this.isHost() : this.signaling.publicKey < peerId;
    if (!dials || spent >= MAX_REDIALS) return;
    this.redials.set(peerId, spent + 1);
    const timer = setTimeout(() => {
      this.redialTimers.delete(timer);
      if (this.closed || this.links.has(peerId)) return;
      void this.connect(peerId, true).catch(() => undefined);
    }, REDIAL_DELAY_MS);
    this.redialTimers.add(timer);
  }

  private async connect(peerId: string, initiator: boolean): Promise<void> {
    if (peerId === this.signaling.publicKey || this.links.has(peerId)) return;
    const link = this.createLink(peerId);
    if (!initiator) return;
    this.attachChannel(peerId, link.pc.createDataChannel('parlour', { ordered: true }));
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    await this.signaling.send(this.roomCode!, peerId, { type: 'offer', sdp: offer.sdp ?? '' });
  }

  private createLink(peerId: string): PeerLink {
    const pc = this.peerConnection({ iceServers: this.iceServers });
    const link: PeerLink = { pc, pendingIce: [], inbox: Promise.resolve() };
    this.links.set(peerId, link);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void this.signaling.send(this.roomCode!, peerId, {
          type: 'ice',
          candidate: event.candidate.toJSON(),
        });
      }
    };
    pc.ondatachannel = (event) => this.attachChannel(peerId, event.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Only the guest-to-host link is the room connection. A host that
        // loses one friend must not flip the lobby to "reconnecting" — that
        // disabled Start after a guest left (D2a) even though the host was
        // still sitting in a live room.
        if (peerId === this.resilience?.hostId && !this.isHost()) {
          this.emitPresence({ kind: 'connection', state: 'reconnecting' });
        }
        // "Reconnecting" used to be a label, not an act: the dead link stayed
        // in `links`, and `connect` refuses to dial a peer it already has an
        // entry for, so the peer was gone for the life of the session. On a
        // phone that is a routine event — a Wi-Fi-to-cellular handoff or a
        // locked screen is enough — and the host would then hear nothing,
        // expire the seat, and hand the player's chair to a bot. Drop the
        // corpse and redial, lowest peer id dialling to avoid glare.
        this.retire(peerId, pc);
      }
    };
    return link;
  }

  private attachChannel(peerId: string, channel: RTCDataChannel): void {
    const link = this.links.get(peerId);
    if (!link) return;
    link.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      // A peer that reaches an open channel has spent none of its redials: the
      // cap is there for a peer that has left, not one on a flaky phone.
      this.redials.delete(peerId);
      this.resilience?.seePeer(peerId, this.now());
      this.sendTo(peerId, { type: 'hello', profile: this.profile });
      this.emitPresence({ kind: 'connection', state: 'connected' });
    };
    channel.onmessage = (event) => {
      dispatchWireData(
        event.data,
        (message) => {
          const next = link.inbox.then(() => this.receiveWire(peerId, message));
          // Keep a rejected packet from wedging every packet after it while
          // returning the original promise so dispatchWireData still reports it.
          link.inbox = next.catch(() => undefined);
          return next;
        },
        (message) => this.emitPresence({ kind: 'error', message }),
      );
    };
  }

  private async receiveSignal(peerId: string, signal: SignalPayload): Promise<void> {
    let link = this.links.get(peerId);
    if (!link) link = this.createLink(peerId);
    if (signal.type === 'offer') {
      await link.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await this.flushIce(link);
      const answer = await link.pc.createAnswer();
      await link.pc.setLocalDescription(answer);
      await this.signaling.send(this.roomCode!, peerId, { type: 'answer', sdp: answer.sdp ?? '' });
    } else if (signal.type === 'answer') {
      await link.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      await this.flushIce(link);
    } else if (link.pc.remoteDescription) {
      await link.pc.addIceCandidate(signal.candidate);
    } else {
      link.pendingIce.push(signal.candidate);
    }
  }

  private async flushIce(link: PeerLink): Promise<void> {
    for (const candidate of link.pendingIce.splice(0)) await link.pc.addIceCandidate(candidate);
  }

  private async receiveWire(peerId: string, message: WireMessage): Promise<void> {
    this.resilience?.seePeer(peerId, this.now());
    switch (message.type) {
      case 'heartbeat':
        if (
          message.hostId === peerId &&
          message.term !== undefined &&
          this.resilience?.considerHostClaim(message.hostId, message.term, false, this.now())
        ) {
          this.pendingResync = true;
          this.pendingHostMigration = true;
          this.sendTo(message.hostId, {
            type: 'sync.request',
            expectedSeq: this.authority.exportSnapshot().log.length,
          });
          this.emitPresence({ kind: 'host.changed', hostId: message.hostId });
        }
        return;
      case 'hello':
        this.profiles.set(peerId, message.profile);
        if (this.isHost()) this.welcome(peerId, message.profile.profileId);
        return;
      case 'welcome':
        if (peerId !== this.resilience?.hostId || message.hostId !== peerId) return;
        this.resilience.considerHostClaim(message.hostId, message.hostTerm ?? 0, true);
        await this.connectMesh(message.peers);
        await this.importMigration(message.snapshot);
        const occupant = this.resilience.seats.get(message.seat);
        if (
          !occupant ||
          occupant.peerId !== this.signaling.publicKey ||
          occupant.profileId !== this.profileId ||
          occupant.bot
        ) {
          throw new Error('welcome seat does not match joining profile');
        }
        /*
         * A welcome carries the whole running match, and importing it told the
         * engine but nobody else. A player rejoining a table mid-hand — a phone
         * that dropped and dialled again — got their seat back, imported the
         * position, and then sat in the lobby reading "the table opens when the
         * host deals" while their own hand was live in memory behind it.
         *
         * Only when the match has actually started: a peer joining a room that
         * is still seating belongs in the lobby, which is where it already is.
         */
        if (message.dealt) {
          this.emitSnapshot({
            kind: 'snapshot',
            reason: 'rejoin',
            snapshot: this.authority.exportSnapshot(),
          });
        }
        return;
      case 'mesh.peers':
        await this.connectMesh(message.peers);
        return;
      case 'deal.commit':
      case 'deal.reveal': {
        // Attributed to the seat the mesh says is speaking. A peer with no seat
        // has nothing to contribute to the deal, so it is simply ignored.
        const seat = this.seatForPeer(peerId);
        if (seat === null) return;
        for (const listener of this.dealListeners) listener(seat, message);
        return;
      }
      case 'presence.state':
        if (peerId === this.resilience?.hostId) this.applyPresence(message.presence);
        return;
      case 'intent':
        if (this.isHost() && this.seatForPeer(peerId) === message.action.seat) {
          await this.applyAsHost(message.action);
        }
        return;
      case 'applied': {
        // Only the seat everyone currently agrees is the authority may move the
        // board. Every other host-shaped message in this switch already says so;
        // this one did not, which left the single most consequential packet in
        // the protocol open to any peer on the mesh.
        const resilience = this.resilience;
        if (!resilience || peerId !== resilience.hostId) return;
        resilience.confirmAction(message.packet.actionId);
        if (this.isHost()) return;
        const remote = await this.authority.applyRemote(message.packet);
        if (remote.fault) {
          this.emitPresence({
            kind: 'error',
            message: `The host played a move the rules do not allow (${remote.fault.error.code}).`,
          });
        }
        const mismatch = this.resilience?.checkHash(
          message.packet.events.at(-1)?.seq ?? 0,
          remote.stateHash,
          message.packet.stateHash,
        );
        if (mismatch) {
          if (!this.pendingResync) {
            this.pendingResync = true;
            this.sendTo(this.resilience!.hostId, { type: 'sync.request', ...mismatch });
          }
        } else if (remote.accepted) this.emitEvent(message.packet);
        return;
      }
      case 'sync.request':
        if (this.isHost())
          this.sendTo(peerId, { type: 'sync.snapshot', snapshot: this.exportMigration() });
        return;
      case 'sync.snapshot': {
        if (peerId !== this.resilience?.hostId) return;
        // Either we asked for it, or the host is publishing the opening
        // position — which is only allowed before a single move has landed.
        const opening = !this.pendingResync;
        if (opening && this.authority.exportSnapshot().log.length > 0) return;
        await this.importMigration(message.snapshot, this.pendingHostMigration);
        const snapshot = this.authority.exportSnapshot();
        this.pendingResync = false;
        this.pendingHostMigration = false;
        this.emitSnapshot({
          kind: 'snapshot',
          reason: opening ? 'opening' : 'divergence',
          snapshot,
        });
        return;
      }
      case 'rematch.request': {
        if (!this.isHost()) return;
        const seat = this.seatForPeer(peerId);
        if (seat === null) return;
        for (const listener of this.rematchListeners) listener(seat);
        return;
      }
      case 'rematch.start': {
        if (peerId !== this.resilience?.hostId || !this.roomCode) return;
        const previous = this.authority.exportSnapshot();
        const incoming = message.snapshot.replay;

        // Ordered channels should not duplicate this packet, but treating an
        // identical replay as idempotent avoids turning a harmless retry into
        // a visible room error.
        if (
          incoming.seed === previous.seed &&
          incoming.stateHash === previous.stateHash &&
          incoming.log.length === previous.log.length
        ) {
          return;
        }
        if (incoming.log.length > 0 || incoming.acceptedActions.length > 0) {
          throw new Error('the host tried to begin a rematch after moves had already been played');
        }
        if (stateHash(incoming.settings) !== stateHash(previous.settings)) {
          throw new Error('the host tried to change the room rules during a rematch');
        }
        const expectedSeed = await rematchDealSeed(
          this.roomCode,
          previous.seed,
          previous.stateHash,
        );
        if (incoming.seed !== expectedSeed) {
          throw new Error('the rematch deal does not follow from the table’s completed shuffle');
        }

        await this.importMigration(message.snapshot);
        const snapshot = this.authority.exportSnapshot();
        this.pendingResync = false;
        this.pendingHostMigration = false;
        this.emitSnapshot({ kind: 'snapshot', reason: 'rematch', snapshot });
        return;
      }
      case 'room.closed':
        if (peerId !== this.resilience?.hostId) return;
        this.emitPresence({ kind: 'room.closed' });
        this.close();
        return;
      case 'host.changed':
        if (peerId !== message.hostId) return;
        if (message.term === undefined) {
          const legacyElection = this.resilience!.expireAndElect(this.now());
          if (legacyElection.hostId !== message.hostId) return;
        } else if (
          !this.resilience!.considerHostClaim(message.hostId, message.term, false, this.now())
        )
          return;
        await this.importMigration(message.snapshot, true);
        this.pendingResync = false;
        this.pendingHostMigration = false;
        this.emitPresence({ kind: 'host.changed', hostId: message.hostId });
        return;
      case 'veil':
        // A peel addressed to another seat is not ours to look at, even though
        // the mesh delivered it.
        if (message.to === null || message.to === this.signaling.publicKey) {
          for (const listener of this.veilListeners) listener(peerId, message.message);
        }
        return;
      case 'emote': {
        const verdict = validateEmote(
          message.emote,
          this.lastReceivedEmote.get(peerId) ?? -Infinity,
          this.now,
        );
        if (verdict.ok) {
          this.lastReceivedEmote.set(peerId, verdict.sentAt);
          this.emitEmote(peerId, message.emote);
        }
      }
    }
  }

  private welcome(peerId: string, profileId: string): void {
    const reclaimed = this.resilience!.reclaimSeat(peerId, profileId);
    const seat = reclaimed ?? this.firstOpenSeat();
    if (seat === null) {
      this.emitPresence({ kind: 'error', message: 'Room is full' });
      this.links.get(peerId)?.pc.close();
      return;
    }
    if (reclaimed === null) this.resilience!.assignSeat(seat, peerId, profileId);
    else this.authority.setSeatBot(seat, false);
    this.sendTo(peerId, {
      type: 'welcome',
      hostId: this.resilience!.hostId,
      hostTerm: this.resilience!.electionTerm,
      seat,
      peers: this.peerDescriptors(),
      snapshot: this.exportMigration(),
      // The host is the only peer that knows whether this table has dealt yet,
      // and a rejoining player needs to be put back at it rather than left
      // reading "the table opens when the host deals" over a live hand.
      dealt: !this.lobbyHold,
    });
    this.broadcast({ type: 'mesh.peers', peers: this.peerDescriptors() });
    this.broadcastPresence();
    this.emitPresence(
      reclaimed === null
        ? {
            kind: 'peer.joined',
            peerId,
            seat,
            profile: this.profileFor(peerId, profileId),
            bot: false,
          }
        : { kind: 'seat.reclaimed', peerId, seat, profile: this.profileFor(peerId, profileId) },
    );
  }

  private firstOpenSeat(): number | null {
    const limit = this.authority.exportSnapshot().settings.seats;
    for (let seat = 0; seat < limit; seat++) if (!this.resilience!.seats.has(seat)) return seat;
    return null;
  }

  private seatForPeer(peerId: string): number | null {
    for (const [seat, occupant] of this.resilience!.seats) {
      if (occupant.peerId === peerId && !occupant.bot) return seat;
    }
    return null;
  }

  private peerDescriptors(): PeerDescriptor[] {
    return [...this.profiles].map(([peerId, profile]) => ({ peerId, profile }));
  }

  private async connectMesh(peers: PeerDescriptor[]): Promise<void> {
    const connections: Promise<void>[] = [];
    for (const peer of peers) {
      this.profiles.set(peer.peerId, peer.profile);
      if (this.signaling.publicKey < peer.peerId) connections.push(this.connect(peer.peerId, true));
    }
    await Promise.all(connections);
  }

  private async applyAsHost(action: PlayerAction): Promise<void> {
    try {
      const packet = await this.authority.apply(action);
      this.resilience?.confirmAction(action.id);
      this.broadcast({ type: 'applied', packet });
      this.emitEvent(packet);
    } catch (error) {
      if (error instanceof DuplicateActionError) return;
      // A refused move is a tap that raced the position and lost — the seat's
      // own screen already swallows the local version of this, and a guest's
      // late tap must not paint an error across the HOST's table. The board
      // every peer renders is still the authoritative one; nothing is lost.
      if (error instanceof MoveRefusedError) {
        for (const listener of this.refusalListeners) listener(action, error.code);
        return;
      }
      this.emitPresence({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Action rejected',
      });
    }
  }

  private async applySystemAsHost(
    actionId: string,
    move: string,
    payload?: unknown,
    reveals?: readonly (readonly [string, string])[],
  ): Promise<void> {
    try {
      const packet = await this.authority.inject!(actionId, move, payload, reveals);
      this.broadcast({ type: 'applied', packet });
      this.emitEvent(packet);
    } catch (error) {
      if (error instanceof DuplicateActionError) return;
      // An injected clock that lost its race — the move that beat it already
      // replaced the phase the timeout described. That is the clock working.
      if (error instanceof MoveRefusedError) return;
      this.emitPresence({
        kind: 'error',
        message: error instanceof Error ? error.message : 'System event rejected',
      });
    }
  }

  private heartbeat(): void {
    if (!this.resilience) return;
    this.broadcast({
      type: 'heartbeat',
      sentAt: this.now(),
      ...(this.isHost()
        ? { hostId: this.resilience.hostId, term: this.resilience.electionTerm }
        : {}),
    });
    const before = new Map(this.resilience.seats);
    const beforePresence = this.resilience.exportPresence();
    const election = this.resilience.expireAndElect(
      this.now(),
      this.heartbeatTimeoutMs,
      this.lobbyHold,
    );
    if (election.changed && this.lobbyHold) {
      this.emitPresence({ kind: 'room.closed' });
      this.close();
      return;
    }
    for (const [seat, occupant] of this.resilience.seats) {
      if (!before.get(seat)?.bot && occupant.bot) {
        this.authority.setSeatBot(seat, true);
        this.emitPresence({ kind: 'peer.left', peerId: occupant.peerId, seat, bot: true });
      }
    }
    for (const [seat, occupant] of before) {
      if (!this.resilience.seats.has(seat) && !occupant.bot) {
        this.emitPresence({ kind: 'peer.left', peerId: occupant.peerId, seat, bot: true });
      }
    }
    if (election.changed) {
      this.broadcast({
        type: 'host.changed',
        hostId: election.hostId,
        term: election.term,
        snapshot: this.exportMigration(),
      });
      this.emitPresence({ kind: 'host.changed', hostId: election.hostId });
      for (const action of election.resend) this.send(action);
    } else if (
      this.isHost() &&
      beforePresence.version !== this.resilience.exportPresence().version
    ) {
      this.broadcastPresence();
    }
  }

  private exportMigration(): MigrationSnapshot {
    return {
      replay: this.authority.exportSnapshot(),
      presence: this.resilience!.exportPresence(),
    };
  }

  private async importMigration(
    snapshot: MigrationSnapshot,
    authoritativePresence = false,
  ): Promise<void> {
    validatePresenceSnapshot(snapshot.presence, snapshot.replay.settings.seats);
    await this.authority.importSnapshot(snapshot.replay);
    this.applyPresence(snapshot.presence, snapshot.replay.settings.seats, authoritativePresence);
  }

  private applyPresence(
    presence: PresenceSnapshot,
    maxSeats?: number,
    authoritative = false,
  ): void {
    const before = new Map(this.resilience!.seats);
    const seats = maxSeats ?? this.authority.exportSnapshot().settings.seats;
    if (!this.resilience!.applyPresence(presence, seats, authoritative)) return;
    for (const [seat, previous] of before) {
      if (!this.resilience!.seats.has(seat) && !previous.bot) {
        this.emitPresence({ kind: 'peer.left', peerId: previous.peerId, seat, bot: true });
      }
    }
    for (const [seat, occupant] of this.resilience!.seats) {
      const previous = before.get(seat);
      if (!previous) {
        this.emitPresence({
          kind: 'peer.joined',
          peerId: occupant.peerId,
          seat,
          profile: occupant.bot
            ? (this.profiles.get(occupant.peerId) ?? houseBotProfile(seat))
            : this.profileFor(occupant.peerId, occupant.profileId),
          bot: occupant.bot,
        });
      } else if (!previous.bot && occupant.bot) {
        this.authority.setSeatBot(seat, true);
        this.emitPresence({ kind: 'peer.left', peerId: occupant.peerId, seat, bot: true });
      } else if (previous.bot && !occupant.bot) {
        this.authority.setSeatBot(seat, false);
        this.emitPresence({
          kind: 'seat.reclaimed',
          peerId: occupant.peerId,
          seat,
          profile: this.profileFor(occupant.peerId, occupant.profileId),
        });
      }
    }
  }

  private profileFor(peerId: string, profileId: string): PlayerProfile {
    return (
      this.profiles.get(peerId) ?? {
        profileId,
        name: 'Friend',
        avatarId: 'cobalt',
      }
    );
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence.state', presence: this.resilience!.exportPresence() });
  }

  private isHost(): boolean {
    return this.resilience?.hostId === this.signaling.publicKey;
  }

  private sendTo(peerId: string, message: WireMessage): void {
    const channel = this.links.get(peerId)?.channel;
    if (channel?.readyState === 'open') channel.send(JSON.stringify(message));
  }

  private broadcast(message: WireMessage): void {
    for (const peerId of this.links.keys()) this.sendTo(peerId, message);
  }

  private emitEvent(event: AppliedPacket): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private emitSnapshot(notification: SnapshotNotification): void {
    for (const listener of this.snapshotListeners) listener(notification);
  }

  private emitPresence(event: PresenceEvent): void {
    for (const listener of this.presenceListeners) listener(event);
  }

  private emitEmote(peerId: string, emote: Emote): void {
    for (const listener of this.emoteListeners) listener(peerId, emote);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('transport is closed');
    if (this.roomCode) throw new Error('transport already has an active room');
  }

  private assertReady(): void {
    if (!this.roomCode || !this.resilience) throw new Error('join or create a room first');
    if (this.closed) throw new Error('transport is closed');
  }
}
