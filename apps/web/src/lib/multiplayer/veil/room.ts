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
import type { VeilSession, VeilRecycleEntry } from './session';
import type { VeilShare } from './ceremony';
import type { VeilMessage } from './wire';

/**
 * Who an opening is for. `surrogate` is a departed seat's card, opened so a bot
 * can play its turn — readable for that, and deliberately not rendered.
 */
export type FaceVisibility = 'private' | 'public' | 'surrogate';

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
  visibility: FaceVisibility;
  shares: VeilShare[];
  resolve: (card: CardId) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const OPEN_TIMEOUT_MS = 20_000;
const RECOVER_TIMEOUT_MS = 15_000;

type PendingRecovery = {
  lostSeat: number;
  epoch: number;
  offers: Map<number, string>;
  resolve: (recovered: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class VeilRoom {
  private readonly pending = new Map<string, Pending>();
  private readonly recovering = new Map<string, PendingRecovery>();
  private readonly recoveryPromises = new Map<string, Promise<boolean>>();
  private readonly receipts: PeelReceipt[] = [];
  private readonly keys = new Map<number, string>();
  /** seats the room has been told are gone; their layers may be recovered */
  private readonly lost = new Set<number>();

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

  /**
   * Lays this seat's layer when it is this seat's turn, publishes it, and hands
   * every other seat one share of the key that would reopen it. The shares go
   * out one at a time and addressed: broadcasting the whole package would give
   * every peer every share and quietly reduce the threshold to one.
   */
  async advanceCeremony(epoch = 0): Promise<boolean> {
    const entry = await this.session.layLayer(epoch);
    if (!entry) return false;
    const transcript = this.session.transcriptRef();
    const signed = transcript?.all().at(-1);
    if (signed) this.link.send({ type: 'veil.entry', entry: signed }, null);
    await this.distributeRecovery(epoch);
    return true;
  }

  /** Opens a fresh signed epoch for a public spent pile, then starts its cascade. */
  async startRecycle(
    epoch: number,
    cards: readonly CardId[],
    participants: readonly number[],
  ): Promise<void> {
    const entry = await this.session.startRecycle(epoch, cards, participants);
    this.link.send({ type: 'veil.entry', entry }, null);
    await this.advanceCeremony(epoch);
  }

  private async distributeRecovery(epoch: number): Promise<void> {
    const holders = this.session
      .participantsFor(epoch)
      .filter((seat) => seat !== this.session.seat);
    for (const { holder, pack } of await this.session.sealRecovery(epoch, holders)) {
      const peer = this.link.peerIdForSeat(holder);
      if (peer) this.link.send({ type: 'veil.recovery', pack }, peer);
    }
  }

  /** Marks a seat as gone, so the peel chain stops waiting for it. */
  markSeatLost(seat: number): void {
    this.lost.add(seat);
  }

  markSeatPresent(seat: number): void {
    this.lost.delete(seat);
  }

  /** Seats whose layer this client rebuilt — no longer private for the round. */
  recoveredSeats(): number[] {
    return this.session.recoveredSeats();
  }

  /**
   * Asks the room for enough shares to rebuild a departed seat's layer.
   *
   * Resolves false rather than throwing when the room's policy is `none` (two
   * seats) or when too few holders answer — the caller pauses the round and
   * says so instead of pretending the cards are gone forever.
   */
  recoverSeat(lostSeat: number, epoch = 0): Promise<boolean> {
    if (!this.session.participates(lostSeat, epoch)) return Promise.resolve(true);
    if (this.session.recoveryFor(epoch).mode === 'none') return Promise.resolve(false);
    if (this.session.canCoverSeat(lostSeat, epoch)) return Promise.resolve(true);
    const key = `${lostSeat}:${epoch}`;
    // Several openings can stall on the same missing seat at once; they all
    // wait on one round of collection rather than each starting their own.
    const inFlight = this.recoveryPromises.get(key);
    if (inFlight) return inFlight;

    this.lost.add(lostSeat);
    const pending = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.recovering.delete(key);
        resolve(false);
      }, RECOVER_TIMEOUT_MS);
      const offers = new Map<number, string>();
      // This seat's own share counts toward the quorum.
      const mine = this.session.shareOfLayer(lostSeat, epoch);
      if (mine) offers.set(this.session.seat, mine);
      this.recovering.set(key, { lostSeat, epoch, offers, resolve, timer });
      this.link.send({ type: 'veil.recover.request', epoch, lostSeat }, null);
      void this.tryRecover(key);
    });
    const tracked = pending.finally(() => this.recoveryPromises.delete(key));
    this.recoveryPromises.set(key, tracked);
    return tracked;
  }

  private async tryRecover(key: string): Promise<void> {
    const waiting = this.recovering.get(key);
    if (!waiting) return;
    if (waiting.offers.size < this.session.recoveryFor(waiting.epoch).threshold) return;
    const result = await this.session.recover(waiting.lostSeat, waiting.epoch, [
      ...waiting.offers.values(),
    ]);
    if ('code' in result) return;
    clearTimeout(waiting.timer);
    this.recovering.delete(key);
    waiting.resolve(true);
  }

  /**
   * Starts an opening for a deck position. Resolves with the card once the
   * chain comes back; rejects if a hop lies or never answers.
   */
  open(epoch: number, position: number, visibility: FaceVisibility): Promise<CardId> {
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
  private chain(epoch: number): number[] {
    const participants = this.session.participantsFor(epoch);
    const others = participants.filter((seat) => seat !== this.session.seat);
    return participants.includes(this.session.seat)
      ? [...others, this.session.seat]
      : [...participants];
  }

  private forward(epoch: number, position: number, locked: string, sequence: number): void {
    const order = this.chain(epoch);
    const seat = order[sequence];
    if (seat === undefined) return;
    if (seat === this.session.seat) {
      void this.applyOwnShare(epoch, position, locked, sequence);
      return;
    }
    // A seat that has gone but whose layer the room rebuilt is peeled here
    // instead of over the wire — that is the whole point of recovery.
    if (this.session.canCoverSeat(seat, epoch)) {
      void this.applyRecoveredShare(seat, epoch, position, locked, sequence);
      return;
    }
    const peer = this.lost.has(seat) ? null : this.link.peerIdForSeat(seat);
    if (!peer) {
      this.fail(
        epoch,
        position,
        this.session.recoveryFor(epoch).mode === 'none'
          ? `Seat ${seat} left. With two players there is no way to reopen their cards without ` +
              `handing over enough key material to read a live hand, so the round pauses here.`
          : `Seat ${seat} left and their layer has not been recovered yet, so this card cannot ` +
              `be opened.`,
      );
      return;
    }
    this.link.send(
      { type: 'veil.peel', epoch, position, forSeat: this.session.seat, locked },
      peer,
    );
  }

  private async applyRecoveredShare(
    seat: number,
    epoch: number,
    position: number,
    locked: string,
    sequence: number,
  ): Promise<void> {
    const share = this.session.shareAs(seat, epoch, position, locked);
    if (!share) {
      this.fail(epoch, position, `seat ${seat}'s layer is not available`);
      return;
    }
    await this.recordReceipt(epoch, position, seat, sequence, share.value);
    const waiting = this.pending.get(`${epoch}:${position}`);
    if (!waiting) return;
    waiting.shares.push(share);
    this.forward(epoch, position, share.value, sequence + 1);
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
    if (waiting.shares.length < this.session.participantsFor(epoch).length) return;
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
        if (this.link.seatForPeer(peerId) !== message.seat) {
          throw new Error('veil hello claimed another seat');
        }
        if (!this.keys.has(message.seat) && message.seat !== this.session.seat) {
          const ownKey = this.keys.get(this.session.seat);
          if (ownKey) {
            this.link.send(
              { type: 'veil.hello', seat: this.session.seat, publicKey: ownKey },
              peerId,
            );
          }
        }
        this.keys.set(message.seat, message.publicKey);
        return;
      case 'veil.header': {
        const fault = await this.session.adoptRound(message.header);
        if (fault) throw new Error(`veil header rejected: ${fault}`);
        return;
      }
      case 'veil.entry': {
        const transcript = this.session.transcriptRef();
        const chainFault = await transcript?.accept(message.entry);
        if (chainFault) throw new Error(`veil transcript rejected an entry: ${chainFault.message}`);
        if (message.entry.kind === 'ceremony.recycle') {
          await this.session.acceptRecycle(message.entry.payload as VeilRecycleEntry);
          return;
        }
        if (message.entry.kind !== 'ceremony.layer') return;
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
        const order = this.chainFor(message.forSeat, message.epoch);
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
      case 'veil.recovery':
        // A sealed layer plus this seat's one share of the key that opens it.
        this.session.acceptRecovery(message.pack);
        return;
      case 'veil.recover.request': {
        // Only ever answer for a seat this client agrees has gone, and answer
        // privately: a broadcast share hands the threshold to everyone.
        if (!this.lost.has(message.lostSeat)) return;
        if (message.lostSeat === this.session.seat) return;
        const share = this.session.shareOfLayer(message.lostSeat, message.epoch);
        if (!share) return;
        this.link.send(
          {
            type: 'veil.recover.offer',
            epoch: message.epoch,
            lostSeat: message.lostSeat,
            holder: this.session.seat,
            share,
          },
          peerId,
        );
        return;
      }
      case 'veil.recover.offer': {
        const key = `${message.lostSeat}:${message.epoch}`;
        const waiting = this.recovering.get(key);
        if (!waiting) return;
        waiting.offers.set(message.holder, message.share);
        await this.tryRecover(key);
        return;
      }
      default:
        return;
    }
  }

  private chainFor(recipient: number, epoch: number): number[] {
    const participants = this.session.participantsFor(epoch);
    const others = participants.filter((seat) => seat !== recipient);
    return participants.includes(recipient) ? [...others, recipient] : [...participants];
  }

  /**
   * A peeler answered. Collect the share, then either ask the next seat or, if
   * this seat is last in the chain, apply its own layer and finish.
   */
  private settleRemote(share: VeilShare, sequence: number): void {
    const key = `${share.epoch}:${share.position}`;
    const waiting = this.pending.get(key);
    if (!waiting) return;
    const order = this.chain(share.epoch);
    if (order[sequence] !== share.seat) {
      this.fail(
        share.epoch,
        share.position,
        `seat ${share.seat} answered outside its peel-chain turn`,
      );
      return;
    }
    if (waiting.shares.some((existing) => existing.seat === share.seat)) return;
    waiting.shares.push(share);
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
    for (const [key, waiting] of this.recovering) {
      clearTimeout(waiting.timer);
      this.recovering.delete(key);
      waiting.resolve(false);
    }
  }
}
