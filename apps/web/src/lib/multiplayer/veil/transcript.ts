import { hashTagged } from './hash';
import { signValue, verifyValue, type VeilIdentity } from './signing';

/**
 * The signed hash chain every Veil room keeps.
 *
 * Ceremony steps, draws, openings and authority changes all land here in one
 * order that every seat can check. Each entry commits to the previous head, so
 * a peer cannot quietly rewrite history, drop a step, or replay one seat's
 * signature into a different position — and at match end the whole chain is
 * what the audit walks.
 */
export interface VeilEntry<P = unknown> {
  seq: number;
  /** the entry's kind, e.g. 'ceremony.layer' or 'deal.open' */
  kind: string;
  /** seat that authored it */
  seat: number;
  /** author's ephemeral public key */
  signer: string;
  /** hash of the entry before this one ('' for the first) */
  previous: string;
  payload: P;
}

export interface SignedVeilEntry<P = unknown> extends VeilEntry<P> {
  hash: string;
  signature: string;
}

export interface VeilRoundHeader {
  roundId: string;
  gameId: string;
  /** hash of the resolved rule values, so a room cannot silently re-configure */
  rulesHash: string;
  seats: number;
  /** ephemeral public key per seat, in seat order */
  keys: readonly string[];
  /** the deck this round shuffles, in canonical order */
  deck: readonly string[];
}

export async function entryHash(entry: VeilEntry): Promise<string> {
  return hashTagged('entry', {
    seq: entry.seq,
    kind: entry.kind,
    seat: entry.seat,
    signer: entry.signer,
    previous: entry.previous,
    payload: entry.payload,
  });
}

export async function headerHash(header: VeilRoundHeader): Promise<string> {
  return hashTagged('header', header);
}

export type TranscriptFault =
  | { code: 'bad-sequence'; message: string }
  | { code: 'broken-chain'; message: string }
  | { code: 'bad-hash'; message: string }
  | { code: 'unknown-seat'; message: string }
  | { code: 'wrong-key'; message: string }
  | { code: 'bad-signature'; message: string };

/**
 * An append-only chain with the checks a hostile peer has to get past: entries
 * arrive in order, extend the accepted head, hash to what they claim, come from
 * a seat that exists, and are signed by that seat's registered key.
 */
export class VeilTranscript {
  private readonly entries: SignedVeilEntry[] = [];
  private head: string;

  private constructor(
    readonly header: VeilRoundHeader,
    readonly headerDigest: string,
  ) {
    this.head = headerDigest;
  }

  static async open(header: VeilRoundHeader): Promise<VeilTranscript> {
    return new VeilTranscript(header, await headerHash(header));
  }

  get length(): number {
    return this.entries.length;
  }

  get headHash(): string {
    return this.head;
  }

  all(): readonly SignedVeilEntry[] {
    return this.entries;
  }

  byKind<P>(kind: string): readonly SignedVeilEntry<P>[] {
    return this.entries.filter((entry) => entry.kind === kind) as SignedVeilEntry<P>[];
  }

  /** Builds, hashes and signs the next entry for this seat. */
  async append<P>(
    identity: VeilIdentity,
    seat: number,
    kind: string,
    payload: P,
  ): Promise<SignedVeilEntry<P>> {
    const entry: VeilEntry<P> = {
      seq: this.entries.length,
      kind,
      seat,
      signer: identity.publicKey,
      previous: this.head,
      payload,
    };
    const hash = await entryHash(entry);
    const signature = await signValue(identity, 'entry', hash);
    const signed: SignedVeilEntry<P> = { ...entry, hash, signature };
    const fault = await this.accept(signed);
    if (fault) throw new Error(`veil transcript rejected its own entry: ${fault.message}`);
    return signed;
  }

  /**
   * Validates a peer's entry and, when it holds up, extends the chain.
   * Returns the fault instead of throwing so callers can report and continue.
   */
  async accept(entry: SignedVeilEntry): Promise<TranscriptFault | null> {
    if (!Number.isInteger(entry.seq) || entry.seq !== this.entries.length) {
      return {
        code: 'bad-sequence',
        message: `expected entry ${this.entries.length}, got ${String(entry.seq)}`,
      };
    }
    if (entry.previous !== this.head) {
      return { code: 'broken-chain', message: 'entry does not extend the accepted head' };
    }
    if (!Number.isInteger(entry.seat) || entry.seat < 0 || entry.seat >= this.header.seats) {
      return { code: 'unknown-seat', message: `seat ${String(entry.seat)} is not at this table` };
    }
    if (this.header.keys[entry.seat] !== entry.signer) {
      return { code: 'wrong-key', message: `seat ${entry.seat} signed with an unregistered key` };
    }
    const expected = await entryHash(entry);
    if (expected !== entry.hash) {
      return { code: 'bad-hash', message: 'entry hash does not match its contents' };
    }
    if (!(await verifyValue(entry.signer, 'entry', entry.hash, entry.signature))) {
      return { code: 'bad-signature', message: 'entry signature does not verify' };
    }
    this.entries.push(entry);
    this.head = entry.hash;
    return null;
  }

  /** Rebuilds a chain from the wire, re-checking every link. */
  static async replay(
    header: VeilRoundHeader,
    entries: readonly SignedVeilEntry[],
  ): Promise<{ transcript: VeilTranscript; fault: TranscriptFault | null }> {
    const transcript = await VeilTranscript.open(header);
    for (const entry of entries) {
      const fault = await transcript.accept(entry);
      if (fault) return { transcript, fault };
    }
    return { transcript, fault: null };
  }
}
