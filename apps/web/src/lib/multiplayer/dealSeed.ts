/**
 * The collaborative deal seed — every seat mixes the shuffle, always, with no
 * ceremony and nothing to choose.
 *
 * The host used to pick the room seed alone. Nothing about that was hidden, but
 * it meant the one player who opens the table also decides the deck, and can
 * keep reopening it until it deals something it likes. That is the cheat that
 * actually happens between friends, and it costs nothing to close.
 *
 * Every seat commits to 32 random bytes before anybody reveals, so no seat can
 * pick its contribution after seeing the others. The seed is the hash of all of
 * them, so a single honest seat is enough to make the deck unpredictable to
 * everyone — including the host. Guests recompute it and check the deal they
 * were handed matches; a host that deals from anything else is caught at the
 * first hand rather than never.
 *
 * What it does not do, stated plainly because the UI repeats it: it does not
 * hide your hand. An open room still replays the whole game on every device, so
 * a modified client can read any hand. That is what Parlour Veil is for — see
 * docs/VEILED-DECK-PROTOCOL.md — and a veiled room gets this guarantee from the
 * shuffle ceremony instead, which is strictly stronger.
 *
 * The one residual: whoever reveals last sees every other nonce before sending
 * its own, so it can refuse to reveal and force the table to redeal. It cannot
 * steer the seed — only withhold — and withholding is visible, because the deal
 * simply does not happen and the round names who is missing.
 */

import type { SeatId } from '@parlour/engine';

/** Bytes of entropy each seat contributes. */
export const DEAL_NONCE_BYTES = 32;

const COMMIT_DOMAIN = 'parlour.deal/commit';
const MIX_DOMAIN = 'parlour.deal/mix';

/** A seat's revealed contribution, as lowercase hex. */
export interface DealContribution {
  seat: SeatId;
  nonce: string;
}

/** True for the exact lowercase-hex shape a nonce or commitment must have. */
export function isDealDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

export function createDealNonce(): string {
  const bytes = new Uint8Array(DEAL_NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The commitment a seat publishes before anyone reveals.
 *
 * Bound to the room and the seat so a commitment cannot be lifted from one
 * table and replayed at another, or claimed on another seat's behalf.
 */
export function dealCommitment(roomCode: string, seat: SeatId, nonce: string): Promise<string> {
  return sha256Hex(`${COMMIT_DOMAIN}|${roomCode}|${seat}|${nonce}`);
}

/**
 * Mixes every seat's contribution into the room's deal seed.
 *
 * Ordered by seat so every peer computes the same number regardless of the
 * order the reveals arrived in, and folded through SHA-256 so no seat can
 * steer the result by choosing its own bytes last.
 */
export async function mixDealSeed(
  roomCode: string,
  contributions: readonly DealContribution[],
): Promise<number> {
  const ordered = [...contributions].sort((left, right) => left.seat - right.seat);
  const digest = await sha256Hex(
    `${MIX_DOMAIN}|${roomCode}|${ordered.map(({ seat, nonce }) => `${seat}:${nonce}`).join('|')}`,
  );
  // The wire bounds a snapshot seed to 0…0xffffffff, so take four bytes as an
  // unsigned integer rather than letting a sign bit through.
  return Number.parseInt(digest.slice(0, 8), 16) >>> 0;
}

/**
 * One room's commit-reveal round.
 *
 * Deliberately forgiving about arrival order — commitments and reveals cross on
 * the wire — and deliberately unforgiving about second thoughts: a seat's first
 * commitment is the one it is held to, or a seat could re-commit after watching
 * everyone else reveal and choose the deck outright.
 */
export class DealSeedRound {
  private readonly commits = new Map<SeatId, string>();
  private readonly nonces = new Map<SeatId, string>();

  recordCommitment(seat: SeatId, commit: string): void {
    if (!isDealDigest(commit) || this.commits.has(seat)) return;
    this.commits.set(seat, commit);
  }

  recordContribution(seat: SeatId, nonce: string): void {
    if (!isDealDigest(nonce) || this.nonces.has(seat)) return;
    this.nonces.set(seat, nonce);
  }

  hasCommitment(seat: SeatId): boolean {
    return this.commits.has(seat);
  }

  hasContribution(seat: SeatId): boolean {
    return this.nonces.has(seat);
  }

  /** Seats still owing a reveal, in seat order — what the room names when it stalls. */
  missing(seats: readonly SeatId[]): SeatId[] {
    return [...seats].sort((left, right) => left - right).filter((seat) => !this.nonces.has(seat));
  }

  /**
   * The agreed seed, or a throw naming what went wrong.
   *
   * Verification happens here rather than on arrival so that a late commitment
   * and its reveal cannot be checked in the wrong order.
   */
  async resolve(roomCode: string, seats: readonly SeatId[]): Promise<number> {
    const contributions: DealContribution[] = [];
    for (const seat of [...seats].sort((left, right) => left - right)) {
      const nonce = this.nonces.get(seat);
      const commit = this.commits.get(seat);
      if (!nonce || !commit) throw new Error(`seat ${seat + 1} never mixed the shuffle`);
      if ((await dealCommitment(roomCode, seat, nonce)) !== commit) {
        throw new Error(`seat ${seat + 1} revealed a shuffle share it had not committed to`);
      }
      contributions.push({ seat, nonce });
    }
    if (contributions.length === 0) throw new Error('no seat mixed the shuffle');
    return mixDealSeed(roomCode, contributions);
  }
}
