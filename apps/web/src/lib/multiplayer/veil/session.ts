/**
 * VeilSession — the client-side state of one veiled room.
 *
 * It owns the seat's ephemeral identity, its layer secrets, the signed
 * transcript, the deck epochs, and the faces this seat has legitimately
 * learned. The rest of the app talks to it in engine terms: give me the deck
 * order to deal from, resolve this shared state for my eyes, turn this move
 * into the openings it needs.
 *
 * What it deliberately does not do is decide game rules. The engine still owns
 * turn order, legality and scoring; Veil only decides which faces a seat is
 * allowed to see and proves that the ones it shows were the ones dealt.
 */

import type { CardId, RuleValues, SeatId, VeilSupport } from '@parlour/engine';
import { veiledDeckOrder } from '@parlour/engine';
import { randomBytes } from './bytes';
import { hashTagged } from './hash';
import {
  acceptLayer,
  baseDeck,
  checkLayer,
  finishOpen,
  handleForPosition,
  layShuffleLayer,
  openEpoch,
  positionForHandle,
  roundIdFor,
  shareFor,
  type CeremonyFault,
  type VeilEpoch,
  type VeilLayerEntry,
  type VeilLayerSecret,
  type VeilShare,
} from './ceremony';
import { createIdentity, type VeilIdentity } from './signing';
import { VeilTranscript, type VeilRoundHeader } from './transcript';
import { auditRound, type AuditReport, type VeilAuditState } from './audit';
import {
  packageRecovery,
  recoverLayer,
  recoveryPolicyFor,
  type RecoveryFault,
  type RecoveryPackage,
  type RecoveryPolicy,
} from './recovery';

export interface VeilSessionOptions {
  roomCode: string;
  seed: number;
  seat: SeatId;
  seats: number;
  gameId: string;
  config: RuleValues;
  random?: (length: number) => Uint8Array;
}

export interface VeilCeremonyProgress {
  /** layers laid so far in the current epoch */
  laid: number;
  seats: number;
  /** true once the deck is fully locked and the room can deal */
  ready: boolean;
  /** cards the room still has to open in public before setup can run */
  awaitingPublicOpens: boolean;
}

/** What the engine needs to start a veiled round. */
export interface VeilDealPlan {
  deckOrder: readonly CardId[];
  /** publicly opened setup cards, in deck order from the game's public index */
  publicSetup: readonly CardId[];
}

function recoveryKey(seat: SeatId, epoch: number): string {
  return `${seat}:${epoch}`;
}

export class VeilSession {
  private identity: VeilIdentity | null = null;
  private transcript: VeilTranscript | null = null;
  private readonly epochs = new Map<number, VeilEpoch>();
  private readonly secrets = new Map<number, VeilLayerSecret>();
  private readonly baseDecks = new Map<number, readonly string[]>();
  /** handle -> card face this seat is entitled to see */
  private readonly known = new Map<CardId, CardId>();
  /** every opening the room performed, for the audit */
  private readonly openings: { epoch: number; position: number; card: CardId }[] = [];
  /** sealed layers other seats published, keyed `seat:epoch` */
  private readonly sealed = new Map<string, RecoveryPackage>();
  /** this seat's share of another seat's recovery key, keyed `seat:epoch` */
  private readonly heldShares = new Map<string, string>();
  /** layers this room reconstructed for a seat that left, keyed `seat:epoch` */
  private readonly recovered = new Map<string, VeilLayerSecret>();
  private nextHandleBase = 0;
  private auditState: VeilAuditState = 'veiled';

  readonly recovery: RecoveryPolicy;

  constructor(private readonly options: VeilSessionOptions) {
    this.recovery = recoveryPolicyFor(options.seats);
  }

  get seat(): SeatId {
    return this.options.seat;
  }

  get publicKey(): string {
    return this.identity?.publicKey ?? '';
  }

  get state(): VeilAuditState {
    return this.auditState;
  }

  /** Mints this seat's round identity. Call once, before the header is built. */
  async start(): Promise<string> {
    this.identity = await createIdentity();
    return this.identity.publicKey;
  }

  /**
   * Seals the round header once every seat's key is known. The header binds the
   * game, the resolved rules and the deck, so a room cannot re-configure itself
   * after the shuffle and claim the transcript still applies.
   */
  async openRound(keys: readonly string[], deck: readonly CardId[]): Promise<VeilRoundHeader> {
    if (keys.length !== this.options.seats) throw new Error('every seat must publish a key');
    const header: VeilRoundHeader = {
      roundId: roundIdFor(this.options.roomCode, this.options.seed, 0),
      gameId: this.options.gameId,
      rulesHash: await hashTagged('rules', this.options.config),
      seats: this.options.seats,
      keys: [...keys],
      deck: [...deck],
    };
    this.transcript = await VeilTranscript.open(header);
    await this.beginEpoch(0, deck);
    return header;
  }

  /** Adopts a header a peer built, after checking it describes this room. */
  async adoptRound(header: VeilRoundHeader): Promise<string | null> {
    if (header.gameId !== this.options.gameId) return 'the room is running a different game';
    if (header.seats !== this.options.seats) return 'the room has a different number of seats';
    if (header.rulesHash !== (await hashTagged('rules', this.options.config)))
      return 'the room is running different rules';
    if (header.keys[this.options.seat] !== this.identity?.publicKey)
      return 'the header does not carry this seat’s key';
    this.transcript = await VeilTranscript.open(header);
    await this.beginEpoch(0, header.deck);
    return null;
  }

  private async beginEpoch(epoch: number, cards: readonly CardId[]): Promise<VeilEpoch> {
    const roundId = roundIdFor(this.options.roomCode, this.options.seed, epoch);
    const opened = await openEpoch(epoch, roundId, cards, this.nextHandleBase);
    this.nextHandleBase += cards.length;
    this.epochs.set(epoch, opened);
    this.baseDecks.set(epoch, baseDeck(opened));
    return opened;
  }

  /** Starts a fresh epoch for a recycled pile, so its new order is unknown again. */
  async recycle(epoch: number, cards: readonly CardId[]): Promise<VeilEpoch> {
    return this.beginEpoch(epoch, cards);
  }

  epochAt(epoch: number): VeilEpoch | null {
    return this.epochs.get(epoch) ?? null;
  }

  progress(epoch = 0): VeilCeremonyProgress {
    const current = this.epochs.get(epoch);
    return {
      laid: current?.layers.length ?? 0,
      seats: this.options.seats,
      ready: current?.deck !== null && current !== undefined,
      awaitingPublicOpens: current?.deck !== null && current !== undefined,
    };
  }

  /**
   * Lays this seat's layer on the epoch as it currently stands and records it
   * in the transcript. `null` means it is not this seat's turn yet.
   */
  async layLayer(epoch = 0): Promise<VeilLayerEntry | null> {
    const current = this.epochs.get(epoch);
    if (!current || !this.identity || !this.transcript) return null;
    if (current.layers.length !== this.options.seat) return null;
    const input =
      current.layers.length === 0
        ? (this.baseDecks.get(epoch) as readonly string[])
        : (current.layers[current.layers.length - 1] as VeilLayerEntry).deck;
    const { entry, secret } = await layShuffleLayer(
      current,
      this.options.seat,
      input,
      this.options.random ?? randomBytes,
    );
    this.secrets.set(epoch, secret);
    await this.transcript.append(this.identity, this.options.seat, 'ceremony.layer', entry);
    this.epochs.set(epoch, acceptLayer(current, entry, this.options.seats));
    return entry;
  }

  /** Checks and applies a layer another seat published. */
  acceptLayer(entry: VeilLayerEntry): CeremonyFault | null {
    const current = this.epochs.get(entry.epoch);
    if (!current) return { code: 'out-of-turn', message: 'unknown deck epoch' };
    const input =
      current.layers.length === 0
        ? (this.baseDecks.get(entry.epoch) as readonly string[])
        : (current.layers[current.layers.length - 1] as VeilLayerEntry).deck;
    const fault = checkLayer(current, entry, input, current.layers.length);
    if (fault) return fault;
    this.epochs.set(entry.epoch, acceptLayer(current, entry, this.options.seats));
    return null;
  }

  /** This seat's share for one deck position — its layer, and only its layer. */
  share(epoch: number, position: number, locked: string): VeilShare | null {
    const current = this.epochs.get(epoch);
    const secret = this.secrets.get(epoch);
    if (!current || !secret) return null;
    return shareFor(current, secret, position, locked, this.options.seat);
  }

  /** The locked value at a deck position, once the ceremony has closed. */
  lockedAt(epoch: number, position: number): string | null {
    const deck = this.epochs.get(epoch)?.deck;
    return deck?.[position] ?? null;
  }

  /**
   * Finishes an opening from every seat's shares and files the face.
   * `visibility: 'private'` keeps it to this seat; `'public'` records it as an
   * opening the whole table saw.
   */
  open(
    epoch: number,
    position: number,
    shares: readonly VeilShare[],
    visibility: 'private' | 'public',
  ): { card: CardId } | { code: string; message: string } {
    const current = this.epochs.get(epoch);
    if (!current) return { code: 'unknown-epoch', message: 'unknown deck epoch' };
    const result = finishOpen(current, shares, this.options.seats);
    if ('code' in result) return result;
    const handle = handleForPosition(current, position);
    this.known.set(handle, result.card);
    if (visibility === 'public') this.openings.push({ epoch, position, card: result.card });
    return { card: result.card };
  }

  /** Faces this seat may render. Handles it has never been dealt are absent. */
  knownFaces(): ReadonlyMap<CardId, CardId> {
    return this.known;
  }

  handleFor(epoch: number, position: number): CardId | null {
    const current = this.epochs.get(epoch);
    return current ? handleForPosition(current, position) : null;
  }

  positionFor(handle: CardId): { epoch: number; position: number } | null {
    for (const [epoch, current] of this.epochs) {
      const position = positionForHandle(current, handle);
      if (position !== null) return { epoch, position };
    }
    return null;
  }

  /**
   * The openings a move needs: for each handle the move makes public, the pair
   * the engine substitutes. Returns null when this seat does not know a face it
   * would have to publish, which is the signal to run a peel first.
   */
  revealsFor(handles: readonly CardId[]): (readonly [CardId, CardId])[] | null {
    const reveals: (readonly [CardId, CardId])[] = [];
    for (const handle of handles) {
      const card = this.known.get(handle);
      if (!card) return null;
      reveals.push([handle, card]);
    }
    return reveals;
  }

  /** Builds the deck order the engine deals from once setup cards are open. */
  dealPlan(support: VeilSupport, publicSetup: readonly CardId[]): VeilDealPlan {
    return {
      deckOrder: veiledDeckOrder(support, this.options.seats, publicSetup, this.options.config),
      publicSetup: [...publicSetup],
    };
  }

  /** First deck position the room must open in public before it can deal. */
  publicSetupPositions(support: VeilSupport, opened: number): number {
    return support.publicSetupFrom(this.options.seats, this.options.config) + opened;
  }

  publicSetupSatisfied(support: VeilSupport, opened: readonly CardId[]): boolean {
    return support.publicSetupReady(opened, this.options.seats, this.options.config);
  }

  transcriptRef(): VeilTranscript | null {
    return this.transcript;
  }

  // -------------------------------------------------------------------------
  // Disconnect recovery
  // -------------------------------------------------------------------------

  /**
   * Seals this seat's layer for an epoch and splits the sealing key across the
   * other seats. Returns one package per holder, each carrying only that
   * holder's share — the sealed blob is identical and safe to repeat, the
   * shares are not. Returns an empty list when the room does not recover.
   */
  async sealRecovery(
    epoch: number,
    holders: readonly SeatId[],
  ): Promise<{ holder: SeatId; pack: RecoveryPackage }[]> {
    const secret = this.secrets.get(epoch);
    if (!secret || this.recovery.mode === 'none' || holders.length === 0) return [];
    const pack = await packageRecovery(
      secret,
      this.options.seat,
      this.recovery,
      [...holders],
      this.options.random ?? randomBytes,
    );
    if (!pack) return [];
    return pack.shares.map((share) => ({
      holder: share.holder,
      pack: { ...pack, shares: [share] },
    }));
  }

  /** Files a sealed layer and the one share of it addressed to this seat. */
  acceptRecovery(pack: RecoveryPackage): void {
    const key = recoveryKey(pack.seat, pack.epoch);
    this.sealed.set(key, { ...pack, shares: [] });
    const mine = pack.shares.find((share) => share.holder === this.options.seat);
    if (mine) this.heldShares.set(key, mine.share);
  }

  /** The share this seat holds of another seat's layer, if it was given one. */
  shareOfLayer(seat: SeatId, epoch: number): string | null {
    return this.heldShares.get(recoveryKey(seat, epoch)) ?? null;
  }

  /**
   * Rebuilds a departed seat's layer from a quorum of shares.
   *
   * This is the moment that seat's privacy ends for the round: whoever holds
   * the reconstructed layer can peel every card it was dealt. It is only ever
   * run for a seat that has actually gone, and {@link recoveredSeats} keeps the
   * fact visible rather than letting it pass silently.
   */
  async recover(
    seat: SeatId,
    epoch: number,
    offered: readonly string[],
  ): Promise<VeilLayerSecret | RecoveryFault> {
    if (seat === this.options.seat) {
      return { code: 'below-threshold', message: 'a seat does not recover its own layer' };
    }
    const pack = this.sealed.get(recoveryKey(seat, epoch));
    if (!pack) {
      return { code: 'tampered', message: `seat ${seat} never published a sealed layer` };
    }
    const result = await recoverLayer(pack, offered, this.recovery);
    if ('code' in result) return result;
    if (result.epoch !== epoch) {
      return { code: 'tampered', message: 'the recovered layer belongs to another epoch' };
    }
    this.recovered.set(recoveryKey(seat, epoch), result);
    return result;
  }

  /** True when this seat can stand in for `seat` on the peel chain. */
  canCoverSeat(seat: SeatId, epoch: number): boolean {
    return seat === this.options.seat
      ? this.secrets.has(epoch)
      : this.recovered.has(recoveryKey(seat, epoch));
  }

  /**
   * A share computed on another seat's behalf, using a layer this room
   * recovered. Refuses for any seat whose layer is still that seat's own.
   */
  shareAs(seat: SeatId, epoch: number, position: number, locked: string): VeilShare | null {
    if (seat === this.options.seat) return this.share(epoch, position, locked);
    const current = this.epochs.get(epoch);
    const secret = this.recovered.get(recoveryKey(seat, epoch));
    if (!current || !secret) return null;
    return shareFor(current, secret, position, locked, seat);
  }

  /**
   * Seats whose layer this client has reconstructed. Their hands are no longer
   * private for the rest of the round, and the room badge says so.
   */
  recoveredSeats(): SeatId[] {
    const seats = new Set<SeatId>();
    for (const key of this.recovered.keys()) seats.add(Number(key.split(':')[0]));
    return [...seats].sort((a, b) => a - b);
  }

  /** This seat's secrets, for the match-end disclosure. */
  disclose(): { seat: SeatId; secret: VeilLayerSecret }[] {
    return [...this.secrets.values()].map((secret) => ({ seat: this.options.seat, secret }));
  }

  /**
   * Runs the audit from every seat's disclosures. Anything short of a clean
   * recomputation lands as `disputed` — never silently as verified.
   */
  async audit(
    disclosed: readonly { seat: SeatId; secret: VeilLayerSecret }[],
  ): Promise<AuditReport> {
    const transcript = this.transcript;
    if (!transcript) {
      this.auditState = 'disputed';
      return {
        state: 'disputed',
        findings: [{ code: 'no-transcript', message: 'this room kept no transcript' }],
        layersChecked: 0,
        openingsChecked: 0,
      };
    }
    const codebooks = new Map([...this.epochs].map(([epoch, value]) => [epoch, value.codebook]));
    const report = await auditRound({
      header: transcript.header,
      transcript,
      baseDecks: this.baseDecks,
      codebooks,
      disclosed,
      openings: this.openings,
    });
    this.auditState = report.state;
    return report;
  }
}
