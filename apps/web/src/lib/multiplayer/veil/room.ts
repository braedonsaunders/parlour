/**
 * VeilRoom — drives the ceremony and the peel chain over a peer mesh.
 *
 * The coordinator is transport-agnostic on purpose: it takes a `VeilLink` that
 * knows how to address a seat and hands it messages. `P2PTransport.sendVeil`
 * satisfies it in the app, and an in-memory bus satisfies it in tests, so the
 * protocol is exercised exactly as it runs in production.
 *
 * ## The peel chain, and why it is a chain
 *
 * Removing a layer is exponentiation, and exponents compose rather than
 * combine: `c^(d₁d₂d₃)` cannot be assembled from three seats each computing
 * `c^dᵢ` independently. So an opening walks the seats one at a time, each
 * handing the still-locked value to the next, with the recipient last. That
 * costs `seats - 1` hops of latency per hidden card — the real, unavoidable
 * price of Veil, and the reason the open tier stays the default.
 *
 * Intermediate values are addressed to one peer and never broadcast. Publishing
 * them would let any onlooker finish the chain, which is the whole secret. Each
 * seat instead keeps a hash of every hop it performed; once keys are disclosed
 * at match end those receipts let the audit pin a dishonest partial decryption
 * on the seat that produced it.
 */

import type { CardId } from '@parlour/engine';
import { sha256Hex } from './hash';
import { fromHex, utf8 } from './bytes';
import type { VeilSession } from './session';
import type { VeilShare } from './ceremony';
import type { VeilMessage } from './wire';

export interface VeilLink {
  /** `to === null` broadcasts to the room. */
  send(message: VeilMessage, to: string | null): void;
  peerIdForSeat(seat: number): string | null;
  seatForPeer(peerId: string): number | null;
}

export interface PeelReceipt {
  epoch: number;
  position: number;
  seat: number;
  sequence: number;
  /** sha256 of the value this hop produced */
  digest: string;
}

type Pending = {
  epoch: number;
  position: number;
  visibility: 'private' | 'public';
  shares: VeilShare[];
  resolve: (card: CardId) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const OPEN_TIMEOUT_MS = 20_000;

export class VeilRoom {
  private readonly pending = new Map<string, Pending>();
  private readonly receipts: PeelReceipt[] = [];
  private readonly keys = new Map<number, string>();

  constructor(
    private readonly session: VeilSession,
    private readonly link: VeilLink,
    private readonly seats: number,
  ) {}

  /** Announces this seat's round key so the header can be sealed. */
  async announce(): Promise<void> {
    const publicKey = await this.session.start();
    this.keys.set(this.session.seat, publicKey);
    this.link.send({ type: 'veil.hello', seat: this.session.seat, publicKey }, null);
  }

  /** True once every seat's key has arrived and a header can be built. */
  get keysReady(): boolean {
    return this.keys.size === this.seats;
  }

  keyList(): string[] {
    return Array.from({ length: this.seats }, (_, seat) => this.keys.get(seat) ?? '');
  }

  /** Host-only: seals and broadcasts the round header. */
  async publishHeader(deck: readonly CardId[]): Promise<void> {
    const header = await this.session.openRound(this.keyList(), deck);
    this.link.send({ type: 'veil.header', header }, null);
  }

  /** Lays this seat's layer when it is this seat's turn, and publishes it. */
  async advanceCeremony(epoch = 0): Promise<boolean> {
    const entry = await this.session.layLayer(epoch);
    if (!entry) return false;
    const transcript = this.session.transcriptRef();
    const signed = transcript?.all().at(-1);
    if (signed) this.link.send({ type: 'veil.entry', entry: signed }, null);
    return true;
  }

  /**
   * Starts an opening for a deck position. Resolves with the card once the
   * chain comes back; rejects if a hop lies or never answers.
   */
  open(epoch: number, position: number, visibility: 'private' | 'public'): Promise<CardId> {
    const locked = this.session.lockedAt(epoch, position);
    if (!locked) return Promise.reject(new Error('the ceremony has not closed yet'));
    const key = `${epoch}:${position}`;
    if (this.pending.has(key)) {
      return Promise.reject(new Error('this position is already being opened'));
    }
    return new Promise<CardId>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('the room did not finish opening this card'));
      }, OPEN_TIMEOUT_MS);
      this.pending.set(key, { epoch, position, visibility, shares: [], resolve, reject, timer });
      this.forward(epoch, position, locked, 0);
    });
  }

  /** Seats that peel, in order, with the recipient last. */
  private chain(): number[] {
    const others = Array.from({ length: this.seats }, (_, seat) => seat).filter(
      (seat) => seat !== this.session.seat,
    );
    return [...others, this.session.seat];
  }

  private forward(epoch: number, position: number, locked: string, sequence: number): void {
    const order = this.chain();
    const seat = order[sequence];
    if (seat === undefined) return;
    if (seat === this.session.seat) {
      void this.applyOwnShare(epoch, position, locked, sequence);
      return;
    }
    const peer = this.link.peerIdForSeat(seat);
    if (!peer) {
      this.fail(epoch, position, `seat ${seat} is not connected, so this card cannot be opened`);
      return;
    }
    this.link.send(
      { type: 'veil.peel', epoch, position, forSeat: this.session.seat, locked },
      peer,
    );
  }

  private async applyOwnShare(
    epoch: number,
    position: number,
    locked: string,
    sequence: number,
  ): Promise<void> {
    const share = this.session.share(epoch, position, locked);
    if (!share) {
      this.fail(epoch, position, 'this seat has no layer for that deck epoch');
      return;
    }
    await this.recordReceipt(epoch, position, this.session.seat, sequence, share.value);
    this.settle(epoch, position, share);
  }

  private settle(epoch: number, position: number, share: VeilShare): void {
    const key = `${epoch}:${position}`;
    const waiting = this.pending.get(key);
    if (!waiting) return;
    waiting.shares.push(share);
    if (waiting.shares.length < this.seats) return;
    clearTimeout(waiting.timer);
    this.pending.delete(key);
    const result = this.session.open(epoch, position, waiting.shares, waiting.visibility);
    if ('code' in result) {
      waiting.reject(new Error(`${result.code}: ${result.message}`));
      return;
    }
    waiting.resolve(result.card);
  }

  private fail(epoch: number, position: number, message: string): void {
    const key = `${epoch}:${position}`;
    const waiting = this.pending.get(key);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    this.pending.delete(key);
    waiting.reject(new Error(message));
  }

  private async recordReceipt(
    epoch: number,
    position: number,
    seat: number,
    sequence: number,
    value: string,
  ): Promise<void> {
    this.receipts.push({
      epoch,
      position,
      seat,
      sequence,
      digest: await sha256Hex(utf8('parlour.veil/peel\n'), fromHex(value)),
    });
  }

  /** Receipts this seat observed, for the match-end audit. */
  peelReceipts(): readonly PeelReceipt[] {
    return this.receipts;
  }

  /** Feed every veil message the transport delivers through here. */
  async receive(peerId: string, message: VeilMessage): Promise<void> {
    switch (message.type) {
      case 'veil.hello':
        this.keys.set(message.seat, message.publicKey);
        return;
      case 'veil.header': {
        const fault = await this.session.adoptRound(message.header);
        if (fault) throw new Error(`veil header rejected: ${fault}`);
        return;
      }
      case 'veil.entry': {
        if (message.entry.kind !== 'ceremony.layer') return;
        const transcript = this.session.transcriptRef();
        const chainFault = await transcript?.accept(message.entry);
        if (chainFault) throw new Error(`veil transcript rejected an entry: ${chainFault.message}`);
        const fault = this.session.acceptLayer(
          message.entry.payload as Parameters<VeilSession['acceptLayer']>[0],
        );
        if (fault) throw new Error(`veil ceremony rejected a layer: ${fault.message}`);
        return;
      }
      case 'veil.peel': {
        // Someone asked this seat to remove its layer. It never sees a
        // plaintext: it hands the still-locked value to the next hop.
        const share = this.session.share(message.epoch, message.position, message.locked);
        if (!share) return;
        const order = this.chainFor(message.forSeat);
        const sequence = order.indexOf(this.session.seat);
        await this.recordReceipt(
          message.epoch,
          message.position,
          this.session.seat,
          sequence,
          share.value,
        );
        this.link.send(
          { type: 'veil.share', share, forSeat: message.forSeat, sequence },
          peerId === null ? null : (this.link.peerIdForSeat(message.forSeat) ?? peerId),
        );
        return;
      }
      case 'veil.share': {
        if (message.forSeat !== this.session.seat) return;
        this.settleRemote(message.share, message.sequence);
        return;
      }
      default:
        return;
    }
  }

  private chainFor(recipient: number): number[] {
    const others = Array.from({ length: this.seats }, (_, seat) => seat).filter(
      (seat) => seat !== recipient,
    );
    return [...others, recipient];
  }

  /**
   * A peeler answered. Collect the share, then either ask the next seat or, if
   * this seat is last in the chain, apply its own layer and finish.
   */
  private settleRemote(share: VeilShare, sequence: number): void {
    const key = `${share.epoch}:${share.position}`;
    const waiting = this.pending.get(key);
    if (!waiting) return;
    if (waiting.shares.some((existing) => existing.seat === share.seat)) return;
    waiting.shares.push(share);
    const order = this.chain();
    const next = sequence + 1;
    if (next >= order.length) return;
    this.forward(share.epoch, share.position, share.value, next);
  }

  /** Drops any opening still in flight, e.g. when the room closes. */
  cancelAll(reason = 'the room closed'): void {
    for (const [key, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      this.pending.delete(key);
      waiting.reject(new Error(reason));
    }
  }
}
