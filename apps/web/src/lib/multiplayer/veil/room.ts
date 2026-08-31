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

import type { CardId, SeatId } from '@parlour/engine';
import { sha256Hex } from './hash';
import { fromHex, utf8 } from './bytes';
import type { VeilSession, VeilRecycleEntry } from './session';
import type { VeilShare } from './ceremony';
import type { VeilCatchUp, VeilMessage } from './wire';
import type { SignedVeilEntry } from './transcript';

/**
 * Who an opening is for. `surrogate` is a departed seat's card, opened so a bot
 * can play its turn — readable for that, and deliberately not rendered.
 */
export type FaceVisibility = 'private' | 'public' | 'surrogate';

/** A peel stopped because that seat is gone — the table turns this into a walkover. */
export const SEAT_LEFT_FAULT = 'seat-left';

export function isSeatLeftFault(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === SEAT_LEFT_FAULT ||
    /seat-left/i.test(message) ||
    /key material to read a live hand/i.test(message) ||
    /no way to reopen their cards/i.test(message)
  );
}

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
  /** re-sends the current remote hop until it is answered */
  retry: ReturnType<typeof setInterval>;
  /** the promise every caller of open() for this position shares */
  promise: Promise<CardId>;
  /**
   * The last hop handed to a REMOTE peer, kept so a chain stalled on a seat
   * that dropped mid-peel can be re-sent when that seat comes back. Answers
   * are deduped by seat, so a resend that crosses a late reply is harmless.
   */
  hop: { sequence: number; value: string } | null;
};

const OPEN_TIMEOUT_MS = 20_000;
/** How often a chain re-asks its unanswered hop. */
const OPEN_RETRY_MS = 1_500;
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
  /** peels that arrived before this seat's layers were restored, answered after catch-up */
  private readonly deferredPeels: { peerId: string; message: VeilMessage }[] = [];

  constructor(
    private readonly session: VeilSession,
    private readonly link: VeilLink,
    private readonly seats: number,
    /** told whether a returning seat rebuilt every layer it had laid */
    private readonly onResume?: (restored: boolean) => void,
  ) {}

  /** Announces this seat's round key so the header can be sealed. */
  async announce(): Promise<void> {
    const publicKey = await this.session.start();
    this.keys.set(this.session.seat, publicKey);
    this.link.send({ type: 'veil.hello', seat: this.session.seat, publicKey }, null);
  }

  /** True once every seat's key has arrived and a header can be built. */
  /**
   * Seats that lay a layer this round. Null until the room says otherwise,
   * which means every seat — the shape a table with no house bots has.
   */
  private participants: readonly SeatId[] | null = null;

  /** Names the seats that will shuffle. Seats left out publish no key. */
  setParticipants(seats: readonly SeatId[] | null): void {
    this.participants = seats ? seats.slice().sort((left, right) => left - right) : null;
  }

  private layingSeats(): SeatId[] {
    return this.participants
      ? [...this.participants]
      : Array.from({ length: this.seats }, (_, seat) => seat);
  }

  get keysReady(): boolean {
    return this.layingSeats().every((seat) => this.keys.has(seat));
  }

  keyList(): string[] {
    return Array.from({ length: this.seats }, (_, seat) => this.keys.get(seat) ?? '');
  }

  /** Host-only: seals and broadcasts the round header. */
  async publishHeader(deck: readonly CardId[]): Promise<void> {
    const header = await this.session.openRound(this.keyList(), deck, this.layingSeats());
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

  /**
   * Asks the table to replay the round to this seat.
   *
   * Sent by a peer that has just come back. It cannot be caught up by whatever
   * is broadcast next — the transcript only accepts entries in sequence, each
   * extending the accepted head — so it needs the round from the beginning.
   */
  requestCatchUp(): void {
    this.link.send({ type: 'veil.catchup.request' }, null);
  }

  /** Everything a returning seat needs to rebuild the round, in order. */
  catchUp(): VeilCatchUp | null {
    const transcript = this.session.transcriptRef();
    if (!transcript) return null;
    return {
      header: transcript.header,
      entries: transcript.all(),
      keys: [...this.keys].map(([seat, publicKey]) => ({ seat, publicKey })),
    };
  }

  /**
   * Replays a round into this seat, then rebuilds the layers it laid before it
   * dropped.
   *
   * Every entry goes through the same validation an entry off the wire does —
   * a peer offering a catch-up is no more trusted than one broadcasting a
   * layer, and the hash chain is what makes a forged replay detectable. The
   * secrets are re-derived and checked against commitments the transcript
   * already holds, so a resumed seat proves it is the one that laid them.
   */
  async adoptCatchUp(catchUp: VeilCatchUp): Promise<boolean> {
    if (this.session.transcriptRef()) return true;
    for (const { seat, publicKey } of catchUp.keys) this.keys.set(seat, publicKey);
    const fault = await this.session.adoptRound(catchUp.header);
    if (fault) throw new Error(`veil catch-up header rejected: ${fault}`);
    for (const entry of catchUp.entries) await this.absorbEntry(entry);
    let restored = true;
    for (const epoch of this.session.laidEpochs()) {
      if (!(await this.session.restoreLayerSecret(epoch))) restored = false;
    }
    return restored;
  }

  /** One transcript entry, chain-checked and dispatched to the ceremony. */
  private async absorbEntry(entry: SignedVeilEntry): Promise<void> {
    const transcript = this.session.transcriptRef();
    const chainFault = await transcript?.accept(entry);
    if (chainFault) throw new Error(`veil transcript rejected an entry: ${chainFault.message}`);
    if (entry.kind === 'ceremony.recycle') {
      await this.session.acceptRecycle(entry.payload as VeilRecycleEntry);
      return;
    }
    if (entry.kind !== 'ceremony.layer') return;
    const fault = this.session.acceptLayer(
      entry.payload as Parameters<VeilSession['acceptLayer']>[0],
    );
    if (fault) throw new Error(`veil ceremony rejected a layer: ${fault.message}`);
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
    // Any peel that went out while the seat was away evaporated with its old
    // connection; without a resend the opening hangs its full timeout and the
    // table wedges on a card nobody is actually withholding.
    this.resendPending();
  }

  /**
   * Re-drives every opening stalled on a remote hop.
   *
   * Only remote hops are re-sent: replaying this seat's own or a recovered
   * share would append a duplicate to the collected set, and the terminal
   * check requires one share per distinct participant. A remote duplicate is
   * safe — the answer path drops shares from a seat it already heard.
   */
  private resendPending(): void {
    for (const waiting of this.pending.values()) {
      if (!waiting.hop) continue;
      this.forward(waiting.epoch, waiting.position, waiting.hop.value, waiting.hop.sequence);
    }
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
    // Chains parked on the seat we just rebuilt can finish locally now.
    this.resendPending();
  }

  /** Replays peels that were parked while this seat's layers were rebuilding. */
  private async answerDeferredPeels(): Promise<void> {
    const parked = this.deferredPeels.splice(0);
    for (const { peerId, message } of parked) {
      await this.receive(peerId, message);
    }
  }

  /**
   * Starts an opening for a deck position. Resolves with the card once the
   * chain comes back; rejects if a hop lies or never answers.
   *
   * Concurrent requests for the same position and audience share one chain and
   * one promise. Fast tables ask twice as a matter of course — every applied
   * packet re-lists the handles this seat cannot read yet, and the first chain
   * is still in flight when the second packet lands — so a duplicate ask is
   * ordinary traffic, not an error. Only a request for a *different* audience
   * is refused: 'public' files an audit opening that 'private' must not.
   */
  open(epoch: number, position: number, visibility: FaceVisibility): Promise<CardId> {
    const locked = this.session.lockedAt(epoch, position);
    if (!locked) return Promise.reject(new Error('the ceremony has not closed yet'));
    const key = `${epoch}:${position}`;
    const existing = this.pending.get(key);
    if (existing) {
      return existing.visibility === visibility
        ? existing.promise
        : Promise.reject(
            new Error('this position is already being opened for a different audience'),
          );
    }
    const promise = new Promise<CardId>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiting = this.pending.get(key);
        if (waiting) clearInterval(waiting.retry);
        this.pending.delete(key);
        reject(new Error('the room did not finish opening this card'));
      }, OPEN_TIMEOUT_MS);
      // A wire can lose a peel or a share — a peer swapping connections
      // mid-rejoin is enough — and a chain with one message missing used to
      // hang its whole timeout. Re-ask periodically instead: peels are
      // answered statelessly and answers are deduped by seat, so asking again
      // is free, and the chain heals the moment the route works.
      const retry = setInterval(() => {
        const waiting = this.pending.get(key);
        if (!waiting?.hop) return;
        this.forward(waiting.epoch, waiting.position, waiting.hop.value, waiting.hop.sequence);
      }, OPEN_RETRY_MS);
      // The executor runs synchronously, so the entry is registered (with a
      // placeholder promise) before forward() can settle or fail it.
      const entry: Pending = {
        epoch,
        position,
        visibility,
        shares: [],
        resolve,
        reject,
        timer,
        retry,
        promise: null as unknown as Promise<CardId>,
        hop: null,
      };
      this.pending.set(key, entry);
      this.forward(epoch, position, locked, 0);
    });
    const entry = this.pending.get(key);
    if (entry) entry.promise = promise;
    return promise;
  }

  /** Seats that peel, in order, with the recipient last. */
  private chain(epoch: number): number[] {
    const participants = this.session.participantsFor(epoch);
    const others = participants.filter((seat) => seat !== this.session.seat);
    return participants.includes(this.session.seat)
      ? others.concat(this.session.seat)
      : participants.slice();
  }

  private forward(epoch: number, position: number, locked: string, sequence: number): void {
    const order = this.chain(epoch);
    const seat = order[sequence];
    if (seat === undefined) return;
    const waiting = this.pending.get(`${epoch}:${position}`);
    if (waiting) waiting.hop = null;
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
    if (waiting) waiting.hop = { sequence, value: locked };
    const peer = this.lost.has(seat) ? null : this.link.peerIdForSeat(seat);
    if (!peer) {
      this.fail(
        epoch,
        position,
        this.session.recoveryFor(epoch).mode === 'none'
          ? SEAT_LEFT_FAULT
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
    clearInterval(waiting.retry);
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
    clearInterval(waiting.retry);
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
      case 'veil.entry':
        await this.absorbEntry(message.entry);
        return;
      case 'veil.catchup.request': {
        // Anyone at the table can answer: the chain is self-verifying, so a
        // replay from a dishonest peer fails on the first altered entry.
        const catchUp = this.catchUp();
        if (catchUp) this.link.send({ type: 'veil.catchup', catchUp }, peerId);
        return;
      }
      case 'veil.catchup': {
        const restored = await this.adoptCatchUp(message.catchUp);
        this.onResume?.(restored);
        if (restored) await this.answerDeferredPeels();
        return;
      }
      case 'veil.peel': {
        // Someone asked this seat to remove its layer. It never sees a
        // plaintext: it hands the still-locked value to the next hop.
        const share = this.session.share(message.epoch, message.position, message.locked);
        if (!share) {
          // A peel can outrun this seat's own catch-up after a rejoin — the
          // layer it needs is still being rebuilt from the transcript. Park
          // the request and answer it the moment the layers are back; dropped
          // silently, the asker's chain hangs its full timeout instead.
          if (this.deferredPeels.length < 64) this.deferredPeels.push({ peerId, message });
          return;
        }
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
    return participants.includes(recipient) ? others.concat(recipient) : participants.slice();
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
      clearInterval(waiting.retry);
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
