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
  commitLayer,
  deriveLayerSecret,
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
import { VeilTranscript, type SignedVeilEntry, type VeilRoundHeader } from './transcript';
import { auditRound, type AuditReport, type VeilAuditState } from './audit';
import {
  packageRecovery,
  recoverLayer,
  recoveryPolicyFor,
  type RecoveryFault,
  type RecoveryPackage,
  type RecoveryPolicy,
} from './recovery';

/** Why this client is allowed to read a given face. */
export type FaceScope = 'mine' | 'public' | 'surrogate';

export interface VeilSessionOptions {
  roomCode: string;
  seed: number;
  seat: SeatId;
  seats: number;
  gameId: string;
  config: RuleValues;
  random?: (length: number) => Uint8Array;
  /**
   * The byte stream this seat's layer for an epoch is built from.
   *
   * Scoped per epoch on purpose: one shared stream would make a layer depend on
   * how many bytes earlier epochs happened to consume, and a resumed session
   * replays epochs it did not draw in the same order. Keyed by epoch, each
   * layer is reproducible on its own.
   */
  layerRandom?: (epoch: number) => Promise<(length: number) => Uint8Array>;
  /** This seat's round key, kept across a disconnect so it returns as itself. */
  identity?: VeilIdentity;
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

/** Signed declaration of the public cards and live seats in a recycled epoch. */
export interface VeilRecycleEntry {
  epoch: number;
  cards: readonly CardId[];
  participants: readonly SeatId[];
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
  /**
   * handle -> the face behind it, and why this client may read it.
   *
   * `mine` is a card dealt to this seat, `public` is one the table turned over,
   * and `surrogate` is one belonging to a seat that dropped and whose layer the
   * room rebuilt. Surrogate faces are deliberately kept out of the rendered
   * view: the host needs them to play the bot's turn, and must not see them on
   * its own table.
   */
  private readonly known = new Map<CardId, { card: CardId; scope: FaceScope }>();
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

  /**
   * Takes up this seat's round identity. Call once, before the header is built.
   *
   * Prefers the identity the room hands it, because a seat that comes back
   * after a disconnect has to sign as the key the round header registered — a
   * freshly minted one is a stranger to the transcript, and every entry it
   * wrote would be refused.
   */
  async start(): Promise<string> {
    this.identity = this.options.identity ?? (await createIdentity());
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
    await this.beginEpoch(0, deck, this.allSeats());
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
    await this.beginEpoch(0, header.deck, this.allSeats());
    return null;
  }

  private allSeats(): SeatId[] {
    return Array.from({ length: this.options.seats }, (_, seat) => seat);
  }

  private validateParticipants(participants: readonly SeatId[]): SeatId[] {
    const ordered = [...participants].sort((a, b) => a - b);
    if (
      ordered.length === 0 ||
      new Set(ordered).size !== ordered.length ||
      ordered.some((seat) => !Number.isInteger(seat) || seat < 0 || seat >= this.options.seats)
    ) {
      throw new Error('a Veil epoch needs distinct live seats from this room');
    }
    return ordered;
  }

  private async beginEpoch(
    epoch: number,
    cards: readonly CardId[],
    participants: readonly SeatId[],
  ): Promise<VeilEpoch> {
    if (this.epochs.has(epoch)) throw new Error(`deck epoch ${epoch} already exists`);
    const latest = Math.max(-1, ...this.epochs.keys());
    if (epoch !== latest + 1) throw new Error(`deck epoch ${epoch} is out of sequence`);
    const roundId = roundIdFor(this.options.roomCode, this.options.seed, epoch);
    const opened = await openEpoch(
      epoch,
      roundId,
      cards,
      this.nextHandleBase,
      this.validateParticipants(participants),
    );
    this.nextHandleBase += cards.length;
    this.epochs.set(epoch, opened);
    this.baseDecks.set(epoch, baseDeck(opened));
    return opened;
  }

  /** Starts a fresh epoch for a recycled pile, so its new order is unknown again. */
  async recycle(
    epoch: number,
    cards: readonly CardId[],
    participants: readonly SeatId[] = this.allSeats(),
  ): Promise<VeilEpoch> {
    return this.beginEpoch(epoch, cards, participants);
  }

  /** Starts and signs a recycled epoch for the rest of the room to adopt. */
  async startRecycle(
    epoch: number,
    cards: readonly CardId[],
    participants: readonly SeatId[],
  ): Promise<SignedVeilEntry<VeilRecycleEntry>> {
    if (!this.identity || !this.transcript) throw new Error('the Veil round is not open');
    const entry: VeilRecycleEntry = {
      epoch,
      cards: [...cards],
      participants: this.validateParticipants(participants),
    };
    await this.beginEpoch(epoch, entry.cards, entry.participants);
    return this.transcript.append(this.identity, this.options.seat, 'ceremony.recycle', entry);
  }

  /** Adopts a recycle declaration after its transcript signature was checked. */
  async acceptRecycle(entry: VeilRecycleEntry): Promise<void> {
    await this.beginEpoch(entry.epoch, entry.cards, entry.participants);
  }

  epochAt(epoch: number): VeilEpoch | null {
    return this.epochs.get(epoch) ?? null;
  }

  /**
   * Every deck epoch this round has opened. A recycled stock starts a new one,
   * and a departed seat's layer has to be rebuilt for all of them — recovering
   * only the opening epoch would leave the reshuffled stock unopenable.
   */
  liveEpochs(): number[] {
    return [...this.epochs.keys()].sort((a, b) => a - b);
  }

  participantsFor(epoch: number): readonly SeatId[] {
    return this.epochs.get(epoch)?.participants ?? [];
  }

  participates(seat: SeatId, epoch: number): boolean {
    return this.participantsFor(epoch).includes(seat);
  }

  recoveryFor(epoch: number): RecoveryPolicy {
    return recoveryPolicyFor(this.participantsFor(epoch).length);
  }

  progress(epoch = 0): VeilCeremonyProgress {
    const current = this.epochs.get(epoch);
    return {
      laid: current?.layers.length ?? 0,
      seats: current?.participants.length ?? this.options.seats,
      ready: current?.deck !== null && current !== undefined,
      awaitingPublicOpens: current?.deck !== null && current !== undefined,
    };
  }

  /**
   * Rebuilds this seat's layer secret for an epoch it already laid.
   *
   * The transcript records what a layer *did* — its deck and its commitment —
   * never the secret behind it, so a returning seat cannot read its layer back
   * off the wire. It re-derives it from its own stream and then proves the
   * result: the rebuilt secret must hash to the commitment the round already
   * accepted. If it does not, this seat cannot peel and must say so rather than
   * carry on with a layer that is not the one it laid, so the room can fall
   * back to recovering the seat properly.
   */
  async restoreLayerSecret(epoch: number): Promise<boolean> {
    if (this.secrets.has(epoch)) return true;
    const current = this.epochs.get(epoch);
    if (!current) return false;
    const mine = current.layers.find((layer) => layer.seat === this.options.seat);
    // Nothing laid on this epoch by this seat is nothing to restore.
    if (!mine) return true;
    const random = await this.options.layerRandom?.(epoch);
    if (!random) return false;
    try {
      const secret = deriveLayerSecret(current, random);
      if ((await commitLayer(secret)) !== mine.commitment) return false;
      this.secrets.set(epoch, secret);
      return true;
    } catch {
      // An exhausted or absent stream means the material is gone.
      return false;
    }
  }

  /** Epochs this seat has laid a layer on, for a returning peer to restore. */
  laidEpochs(): number[] {
    return [...this.epochs.entries()]
      .filter(([, epoch]) => epoch.layers.some((layer) => layer.seat === this.options.seat))
      .map(([index]) => index)
      .sort((left, right) => left - right);
  }

  /**
   * Lays this seat's layer on the epoch as it currently stands and records it
   * in the transcript. `null` means it is not this seat's turn yet.
   */
  async layLayer(epoch = 0): Promise<VeilLayerEntry | null> {
    const current = this.epochs.get(epoch);
    if (!current || !this.identity || !this.transcript) return null;
    const expectedSeat = current.participants[current.layers.length];
    if (expectedSeat !== this.options.seat) return null;
    const input =
      current.layers.length === 0
        ? (this.baseDecks.get(epoch) as readonly string[])
        : (current.layers[current.layers.length - 1] as VeilLayerEntry).deck;
    const { entry, secret } = await layShuffleLayer(
      current,
      this.options.seat,
      input,
      // A derived stream makes this layer reproducible by this seat and nobody
      // else, which is what lets a dropped player resume its own round instead
      // of the table recovering it on their behalf. See veil/material.ts.
      (await this.options.layerRandom?.(epoch)) ?? this.options.random ?? randomBytes,
    );
    this.secrets.set(epoch, secret);
    await this.transcript.append(this.identity, this.options.seat, 'ceremony.layer', entry);
    this.epochs.set(epoch, acceptLayer(current, entry, current.participants));
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
    const expectedSeat = current.participants[current.layers.length];
    if (expectedSeat === undefined) {
      return { code: 'out-of-turn', message: 'this deck epoch is already closed' };
    }
    const fault = checkLayer(current, entry, input, expectedSeat);
    if (fault) return fault;
    this.epochs.set(entry.epoch, acceptLayer(current, entry, current.participants));
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
    visibility: 'private' | 'public' | 'surrogate',
  ): { card: CardId } | { code: string; message: string } {
    const current = this.epochs.get(epoch);
    if (!current) return { code: 'unknown-epoch', message: 'unknown deck epoch' };
    const result = finishOpen(current, shares, current.participants.length, position);
    if ('code' in result) return result;
    const handle = handleForPosition(current, position);
    const scope: FaceScope =
      visibility === 'public' ? 'public' : visibility === 'surrogate' ? 'surrogate' : 'mine';
    // A card already readable for a better reason keeps that reason: opening a
    // public card again must not demote it to surrogate-only.
    const existing = this.known.get(handle);
    if (!existing || existing.scope === 'surrogate')
      this.known.set(handle, { card: result.card, scope });
    if (visibility === 'public') this.openings.push({ epoch, position, card: result.card });
    return { card: result.card };
  }

  /**
   * Every face this client can compute, including ones it holds only as a
   * surrogate for a departed seat. Used to turn a played card back into its
   * opening — the bot driver needs it, the renderer must not.
   */
  knownFaces(): ReadonlyMap<CardId, CardId> {
    return new Map([...this.known].map(([handle, entry]) => [handle, entry.card]));
  }

  /**
   * Faces this seat is entitled to *see*: its own cards and public ones. A
   * departed seat's hand is excluded, so recovering a layer never quietly turns
   * the host's table face up.
   */
  visibleFaces(): ReadonlyMap<CardId, CardId> {
    const visible = new Map<CardId, CardId>();
    for (const [handle, entry] of this.known) {
      if (entry.scope !== 'surrogate') visible.set(handle, entry.card);
    }
    return visible;
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
      const entry = this.known.get(handle);
      if (!entry) return null;
      reveals.push([handle, entry.card]);
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
    const policy = this.recoveryFor(epoch);
    if (!secret || policy.mode === 'none' || holders.length === 0) return [];
    const pack = await packageRecovery(
      secret,
      this.options.seat,
      policy,
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
    const result = await recoverLayer(pack, offered, this.recoveryFor(epoch));
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
