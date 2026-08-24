import { createRoomCode, roomJoinUrl, validateRoomCode } from '../rooms/code';
import { NostrSignaling, type SignalPayload } from './NostrSignaling';
import { HEARTBEAT_INTERVAL_MS, MultiplayerState, validatePresenceSnapshot } from './resilience';
import { validateEmote } from './emotes';
import { dispatchWireData, type PeerDescriptor, type WireMessage } from './wireSchema';
import type {
  AppliedPacket,
  AuthorityAdapter,
  Emote,
  MigrationSnapshot,
  PlayerAction,
  PresenceSnapshot,
  PresenceEvent,
  RoomHandle,
  RoomSettings,
  SnapshotNotification,
  Transport,
} from './types';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

type PeerLink = {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  pendingIce: RTCIceCandidateInit[];
  profileId?: string;
};

type P2PTransportOptions = {
  authority: AuthorityAdapter;
  profileId: string;
  signaling?: NostrSignaling;
  iceServers?: RTCIceServer[];
  origin?: string;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  peerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
};

export class P2PTransport implements Transport {
  private readonly authority: AuthorityAdapter;
  private readonly profileId: string;
  private readonly signaling: NostrSignaling;
  private readonly iceServers: RTCIceServer[];
  private readonly origin: string;
  private readonly now: () => number;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly peerConnection: (configuration: RTCConfiguration) => RTCPeerConnection;
  private readonly links = new Map<string, PeerLink>();
  private readonly profiles = new Map<string, string>();
  private readonly eventListeners = new Set<(event: AppliedPacket) => void>();
  private readonly snapshotListeners = new Set<(notification: SnapshotNotification) => void>();
  private readonly presenceListeners = new Set<(event: PresenceEvent) => void>();
  private readonly emoteListeners = new Set<(peerId: string, emote: Emote) => void>();
  private readonly lastReceivedEmote = new Map<string, number>();
  private resilience?: MultiplayerState;
  private roomCode?: string;
  private signalSubscription?: { close(): void };
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private lastEmoteAt = -Infinity;
  private pendingResync = false;
  private closed = false;

  constructor(options: P2PTransportOptions) {
    this.authority = options.authority;
    this.profileId = options.profileId;
    this.signaling = options.signaling ?? new NostrSignaling();
    this.iceServers = options.iceServers ?? DEFAULT_ICE_SERVERS;
    this.origin = options.origin ?? window.location.origin;
    this.now = options.now ?? (() => Date.now());
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
    if (settings.seats < 2 || settings.seats > 4) throw new Error('rooms require 2–4 seats');
    const code = createRoomCode(this.randomBytes);
    await this.signaling.announce(code, settings);
    this.startRoom(code, this.signaling.publicKey);
    this.resilience?.assignSeat(0, this.signaling.publicKey, this.profileId);
    this.profiles.set(this.signaling.publicKey, this.profileId);
    return this.handle(code);
  }

  async join(rawCode: string): Promise<RoomHandle> {
    this.assertOpen();
    const verdict = validateRoomCode(rawCode);
    if (!verdict.ok) throw new Error('Room codes use four unambiguous letters or digits');
    const { code } = verdict;
    this.emitPresence({ kind: 'connection', state: 'connecting' });
    const room = await this.signaling.resolve(code);
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

  onPresence(callback: (presence: PresenceEvent) => void): () => void {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  onEmote(callback: (peerId: string, emote: Emote) => void): () => void {
    this.emoteListeners.add(callback);
    return () => this.emoteListeners.delete(callback);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
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
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private handle(code: string): RoomHandle {
    return {
      code,
      peerId: this.signaling.publicKey,
      hostId: this.resilience!.hostId,
      shareUrl: roomJoinUrl(this.origin, code),
      close: () => this.close(),
    };
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
    const link: PeerLink = { pc, pendingIce: [] };
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
        this.emitPresence({ kind: 'connection', state: 'reconnecting' });
      }
    };
    return link;
  }

  private attachChannel(peerId: string, channel: RTCDataChannel): void {
    const link = this.links.get(peerId);
    if (!link) return;
    link.channel = channel;
    channel.onopen = () => {
      this.resilience?.seePeer(peerId, this.now());
      this.sendTo(peerId, { type: 'hello', profileId: this.profileId });
      this.emitPresence({ kind: 'connection', state: 'connected' });
    };
    channel.onmessage = (event) => {
      dispatchWireData(
        event.data,
        (message) => this.receiveWire(peerId, message),
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
        return;
      case 'hello':
        this.profiles.set(peerId, message.profileId.slice(0, 128));
        if (this.isHost()) this.welcome(peerId, message.profileId.slice(0, 128));
        return;
      case 'welcome':
        if (peerId !== this.resilience?.hostId || message.hostId !== peerId) return;
        this.resilience.hostId = message.hostId;
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
        await this.connectMesh(message.peers);
        return;
      case 'mesh.peers':
        await this.connectMesh(message.peers);
        return;
      case 'presence.state':
        if (peerId === this.resilience?.hostId) this.applyPresence(message.presence);
        return;
      case 'intent':
        if (this.isHost() && this.seatForPeer(peerId) === message.action.seat) {
          await this.applyAsHost(message.action);
        }
        return;
      case 'applied': {
        this.resilience?.confirmAction(message.packet.actionId);
        if (this.isHost()) return;
        const localHash = await this.authority.applyRemote(message.packet);
        const mismatch = this.resilience?.checkHash(
          message.packet.events.at(-1)?.seq ?? 0,
          localHash,
          message.packet.stateHash,
        );
        if (mismatch) {
          if (!this.pendingResync) {
            this.pendingResync = true;
            this.sendTo(this.resilience!.hostId, { type: 'sync.request', ...mismatch });
          }
        } else this.emitEvent(message.packet);
        return;
      }
      case 'sync.request':
        if (this.isHost())
          this.sendTo(peerId, { type: 'sync.snapshot', snapshot: this.exportMigration() });
        return;
      case 'sync.snapshot':
        if (peerId === this.resilience?.hostId && this.pendingResync) {
          await this.importMigration(message.snapshot);
          const snapshot = this.authority.exportSnapshot();
          this.pendingResync = false;
          this.emitSnapshot({ kind: 'snapshot', reason: 'divergence', snapshot });
        }
        return;
      case 'host.changed':
        this.resilience!.expireAndElect(this.now());
        if (peerId !== message.hostId || message.hostId !== this.resilience!.hostId) return;
        await this.importMigration(message.snapshot);
        this.emitPresence({ kind: 'host.changed', hostId: message.hostId });
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
      seat,
      peers: this.peerDescriptors(),
      snapshot: this.exportMigration(),
    });
    this.broadcast({ type: 'mesh.peers', peers: this.peerDescriptors() });
    this.broadcastPresence();
    this.emitPresence(
      reclaimed === null
        ? { kind: 'peer.joined', peerId, seat }
        : { kind: 'seat.reclaimed', peerId, seat },
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
    return [...this.profiles].map(([peerId, profileId]) => ({ peerId, profileId }));
  }

  private async connectMesh(peers: PeerDescriptor[]): Promise<void> {
    const connections: Promise<void>[] = [];
    for (const peer of peers) {
      this.profiles.set(peer.peerId, peer.profileId);
      if (this.signaling.publicKey < peer.peerId) connections.push(this.connect(peer.peerId, true));
    }
    await Promise.all(connections);
  }

  private async applyAsHost(action: PlayerAction): Promise<void> {
    if (!this.resilience?.acceptAction(action.id)) return;
    try {
      const packet = await this.authority.apply(action);
      this.resilience.confirmAction(action.id);
      this.broadcast({ type: 'applied', packet });
      this.emitEvent(packet);
    } catch (error) {
      this.emitPresence({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Action rejected',
      });
    }
  }

  private heartbeat(): void {
    if (!this.resilience) return;
    this.broadcast({ type: 'heartbeat', sentAt: this.now() });
    const before = new Map(this.resilience.seats);
    const beforePresence = this.resilience.exportPresence();
    const election = this.resilience.expireAndElect(this.now());
    for (const [seat, occupant] of this.resilience.seats) {
      if (!before.get(seat)?.bot && occupant.bot) {
        this.authority.setSeatBot(seat, true);
        this.emitPresence({ kind: 'peer.left', peerId: occupant.peerId, seat, bot: true });
      }
    }
    if (election.changed) {
      this.broadcast({
        type: 'host.changed',
        hostId: election.hostId,
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

  private async importMigration(snapshot: MigrationSnapshot): Promise<void> {
    validatePresenceSnapshot(snapshot.presence, snapshot.replay.settings.seats);
    await this.authority.importSnapshot(snapshot.replay);
    this.applyPresence(snapshot.presence, snapshot.replay.settings.seats);
  }

  private applyPresence(presence: PresenceSnapshot, maxSeats?: number): void {
    const before = new Map(this.resilience!.seats);
    const seats = maxSeats ?? this.authority.exportSnapshot().settings.seats;
    if (!this.resilience!.applyPresence(presence, seats)) return;
    for (const [seat, occupant] of this.resilience!.seats) {
      const previous = before.get(seat);
      if (!previous) {
        this.emitPresence({ kind: 'peer.joined', peerId: occupant.peerId, seat });
      } else if (!previous.bot && occupant.bot) {
        this.authority.setSeatBot(seat, true);
        this.emitPresence({ kind: 'peer.left', peerId: occupant.peerId, seat, bot: true });
      } else if (previous.bot && !occupant.bot) {
        this.authority.setSeatBot(seat, false);
        this.emitPresence({ kind: 'seat.reclaimed', peerId: occupant.peerId, seat });
      }
    }
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
