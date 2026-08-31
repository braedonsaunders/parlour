import { makeRng, type Rng } from '@parlour/engine';
import type {
  RoomAnnouncement,
  RoomSignaling,
  SignalPayload,
} from '@/lib/multiplayer/NostrSignaling';
import type { RoomSettings } from '@/lib/multiplayer/types';

/**
 * A simulated network between two (or more) devices, for the duel harness.
 *
 * The production stack already exposes exactly two seams — `RoomSignaling` and
 * the `peerConnection` factory — and the unit tests fill them with microtask
 * mocks. Microtasks are too polite: on a real pair of phones the signalling
 * path and every data channel race each other with independent delays, and
 * most multiplayer bugs live in exactly those interleavings. This fabric keeps
 * the mocks' shape but routes every message through a seeded latency queue:
 *
 * - each (sender → receiver) link draws an independent delay per message;
 * - a link never reorders its own messages (real DataChannels are `ordered`,
 *   and Nostr subscriptions are per-socket FIFO in practice), so a delayed
 *   message holds back the ones behind it — head-of-line blocking included;
 * - different links are entirely unsynchronised, which is the point.
 *
 * The rng is owned by the fabric, so one `seed` reproduces one interleaving.
 * Timers are real (`setTimeout`) because the room and the veil await real
 * `crypto.subtle` work that fake timers would deadlock against; delays stay in
 * the 0–20 ms range so a match still plays in seconds while the schedule
 * shuffles as much as a WAN's would.
 *
 * Faults: `crash(label)` silences every link touching a device — packets
 * already in flight land, nothing sent after gets through — which is what a
 * dead radio looks like from the other side: silence, then a heartbeat
 * timeout. A graceful quit is not modelled here; call `session.close()` for
 * that.
 */

export interface LatencyProfile {
  readonly minMs: number;
  readonly maxMs: number;
}

export interface DuelNetOptions {
  seed: number;
  /** per-message delay on the signalling path (defaults 1–10 ms) */
  signal?: LatencyProfile;
  /** per-message delay on peer data channels (defaults 1–8 ms) */
  data?: LatencyProfile;
}

const DEFAULT_SIGNAL: LatencyProfile = { minMs: 1, maxMs: 10 };
const DEFAULT_DATA: LatencyProfile = { minMs: 1, maxMs: 8 };

type SignalHandler = (sender: string, signal: SignalPayload) => void;

/** Deterministic well-formed 32-byte-hex pubkey for a labelled seat. */
export function duelPubkey(label: string): string {
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

/** One FIFO link: delayed, ordered, and severable. */
class Link {
  private lastAt = 0;
  private pending = 0;

  constructor(
    private readonly net: DuelNet,
    private readonly profile: () => LatencyProfile,
    /** both endpoint labels, so a crash on either side severs the link */
    private readonly endpoints: readonly [string, string],
  ) {}

  get inFlight(): number {
    return this.pending;
  }

  send(deliver: () => void): void {
    // Sent after the crash: the radio is off, nothing leaves the device.
    if (this.endpoints.some((endpoint) => this.net.isCrashed(endpoint))) return;
    const { minMs, maxMs } = this.profile();
    const delay = minMs + this.net.rng.float() * Math.max(0, maxMs - minMs);
    const now = this.net.elapsed();
    const at = Math.max(now + delay, this.lastAt);
    this.lastAt = at;
    this.pending++;
    setTimeout(
      () => {
        this.pending--;
        // In flight during the crash: the packet arrives — the sender's device
        // died, not the receiver's — unless the RECEIVER is the dead one.
        if (this.endpoints.some((endpoint) => this.net.isCrashed(endpoint))) return;
        deliver();
      },
      Math.max(0, at - now),
    );
  }
}

export class DuelNet {
  readonly rng: Rng;
  private readonly startedAt = Date.now();
  private readonly crashed = new Set<string>();
  private readonly links = new Map<string, Link>();
  private readonly signal: LatencyProfile;
  private readonly data: LatencyProfile;

  /** rooms and handlers behind the signalling seam — same shape as the relays */
  private readonly rooms = new Map<string, RoomAnnouncement[]>();
  private readonly signalHandlers = new Map<string, Map<string, SignalHandler>>();

  /** peer connections by mock-SDP id, for offer/answer pairing */
  private readonly rtcPeers = new Map<string, DuelPeerConnection>();
  private nextRtcId = 0;

  constructor(options: DuelNetOptions) {
    this.rng = makeRng(options.seed);
    this.signal = options.signal ?? DEFAULT_SIGNAL;
    this.data = options.data ?? DEFAULT_DATA;
  }

  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  isCrashed(label: string): boolean {
    return this.crashed.has(label);
  }

  /** Pull the plug on a device: every link it touches goes silent, both ways. */
  crash(label: string): void {
    this.crashed.add(label);
  }

  /** Plug it back in (a rejoining player builds NEW sessions; links revive). */
  restore(label: string): void {
    this.crashed.delete(label);
  }

  link(kind: 'signal' | 'data', from: string, to: string): Link {
    const key = `${kind}:${from}->${to}`;
    let link = this.links.get(key);
    if (!link) {
      link = new Link(this, () => (kind === 'signal' ? this.signal : this.data), [from, to]);
      this.links.set(key, link);
    }
    return link;
  }

  /** Messages currently sitting in latency queues, for quiescence checks. */
  inFlight(): number {
    let total = 0;
    for (const link of this.links.values()) total += link.inFlight;
    return total;
  }

  // -------------------------------------------------------------------------
  // Signalling seam
  // -------------------------------------------------------------------------

  signaling(label: string): RoomSignaling {
    const net = this;
    const publicKey = duelPubkey(label);
    return {
      publicKey,
      async announce(code: string, settings: RoomSettings) {
        const existing = net.rooms.get(code) ?? [];
        net.rooms.set(code, [...existing, { hostPubkey: publicKey, settings }]);
      },
      async resolve(code: string, expectedHost?: string) {
        const room = net.rooms.get(code);
        if (!room || room.length === 0) throw new Error('Room not found');
        if (expectedHost !== undefined) {
          for (let i = room.length - 1; i >= 0; i--) {
            if (room[i]!.hostPubkey === expectedHost) return room[i]!;
          }
          throw new Error('Room host does not match this invite');
        }
        return room[room.length - 1]!;
      },
      subscribe(code: string, callback: SignalHandler) {
        const handlers = net.signalHandlers.get(code) ?? new Map<string, SignalHandler>();
        handlers.set(publicKey, callback);
        net.signalHandlers.set(code, handlers);
        return { close: () => handlers.delete(publicKey) };
      },
      async send(code: string, recipient: string, signal: SignalPayload) {
        net
          .link('signal', publicKey, recipient)
          .send(() => net.signalHandlers.get(code)?.get(recipient)?.(publicKey, signal));
      },
      close() {},
    } as unknown as RoomSignaling;
  }

  // -------------------------------------------------------------------------
  // WebRTC seam
  // -------------------------------------------------------------------------

  rtcFactory(label: string): () => RTCPeerConnection {
    return () => {
      const peer = new DuelPeerConnection(`${label}#${this.nextRtcId++}`, label, this);
      this.rtcPeers.set(peer.id, peer);
      return peer as unknown as RTCPeerConnection;
    };
  }

  rtcPeer(id: string): DuelPeerConnection | undefined {
    return this.rtcPeers.get(id);
  }
}

class DuelDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  peer?: DuelDataChannel;

  constructor(
    private readonly net: DuelNet,
    /** this endpoint's device label; the wire runs from here to peer.owner */
    readonly owner: string,
  ) {}

  send(data: string): void {
    const remote = this.peer;
    if (!remote) return;
    this.net.link('data', this.owner, remote.owner).send(() => {
      if (remote.readyState !== 'open') return;
      remote.onmessage?.(new MessageEvent('message', { data }));
    });
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }
}

export class DuelPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: RTCPeerConnection['onicecandidate'] = null;
  ondatachannel: RTCPeerConnection['ondatachannel'] = null;
  onconnectionstatechange: RTCPeerConnection['onconnectionstatechange'] = null;
  private outgoing?: DuelDataChannel;
  private initiator?: DuelPeerConnection;

  constructor(
    readonly id: string,
    readonly owner: string,
    private readonly net: DuelNet,
  ) {}

  createDataChannel(): RTCDataChannel {
    this.outgoing = new DuelDataChannel(this.net, this.owner);
    return this.outgoing as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: this.id };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.initiator?.outgoing) throw new Error('offer did not include a data channel');
    const incoming = new DuelDataChannel(this.net, this.owner);
    incoming.peer = this.initiator.outgoing;
    this.initiator.outgoing.peer = incoming;
    const onDataChannel = this.ondatachannel as ((event: RTCDataChannelEvent) => void) | null;
    onDataChannel?.({ channel: incoming as unknown as RTCDataChannel } as RTCDataChannelEvent);
    queueMicrotask(() => {
      incoming.open();
      this.initiator?.outgoing?.open();
      this.markConnected();
      this.initiator?.markConnected();
    });
    return { type: 'answer', sdp: this.id };
  }

  private markConnected(): void {
    this.connectionState = 'connected';
    (this.onconnectionstatechange as (() => void) | null)?.();
  }

  async setLocalDescription(): Promise<void> {}

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    if (description.type === 'offer' && description.sdp) {
      this.initiator = this.net.rtcPeer(description.sdp);
    }
  }

  async addIceCandidate(): Promise<void> {}

  close(): void {
    this.connectionState = 'closed';
    this.outgoing?.close();
  }
}
