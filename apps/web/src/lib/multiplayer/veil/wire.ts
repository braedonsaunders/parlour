/**
 * Veil wire messages and their validators.
 *
 * Everything here crosses a DataChannel from a peer that may be hostile, so the
 * rule is the same as the room's existing wire schema: parse into an exact
 * shape with hard bounds, reject anything else, and never let a malformed
 * packet reach the crypto or the engine. Sizes are bounded by the deck, not by
 * whatever the sender claims.
 */

import { VEIL_ELEMENT_BYTES } from './sra';
import type { VeilLayerEntry, VeilShare } from './ceremony';
import type { SignedVeilEntry, VeilRoundHeader } from './transcript';
import type { RecoveryPackage } from './recovery';
import type { VeilRecycleEntry } from './session';

const MAX_SEATS = 8;
const MAX_DECK = 256;
/** P-256 SPKI is 91 bytes (122 base64url); extra headroom covers WebKit exports. */
const MAX_KEY = 512;
const MAX_SIGNATURE = 512;
const MAX_ID = 128;
const HASH_HEX = 64;
const ELEMENT_HEX = VEIL_ELEMENT_BYTES * 2;
const MAX_SEALED_HEX = 8_192;
const MAX_SHARE_HEX = 1_024;
/** Ceiling on a replayed round: a header, its layers and every epoch since. */
const MAX_CATCH_UP_ENTRIES = 1_024;

export type VeilMessage =
  | { type: 'veil.hello'; seat: number; publicKey: string }
  | { type: 'veil.header'; header: VeilRoundHeader }
  | { type: 'veil.entry'; entry: SignedVeilEntry }
  | { type: 'veil.peel'; epoch: number; position: number; forSeat: number; locked: string }
  | { type: 'veil.share'; share: VeilShare; forSeat: number; sequence: number }
  | { type: 'veil.recovery'; pack: RecoveryPackage }
  /** "seat N is gone — send me your share of its layer" */
  | { type: 'veil.recover.request'; epoch: number; lostSeat: number }
  /** one holder's answer, addressed to the requester and never broadcast */
  | { type: 'veil.recover.offer'; epoch: number; lostSeat: number; holder: number; share: string }
  | { type: 'veil.disclose'; seat: number; secrets: readonly VeilDisclosedSecret[] }
  /**
   * "I dropped and I am back — replay the round to me."
   *
   * The transcript is a hash chain: entries are accepted only in sequence and
   * only when they extend the head, so a returning seat cannot be caught up by
   * whatever happens to be broadcast next. It needs the header and every entry
   * from the beginning, which is what {@link VeilCatchUp} carries.
   */
  | { type: 'veil.catchup.request' }
  | { type: 'veil.catchup'; catchUp: VeilCatchUp };

/** A whole round, in order, for a seat that missed it. */
export interface VeilCatchUp {
  header: VeilRoundHeader;
  entries: readonly SignedVeilEntry[];
  /** every seat's round key, so the returning peer can verify what it replays */
  keys: readonly { seat: number; publicKey: string }[];
}

/** A layer secret in transport form — bigints travel as hex, never as numbers. */
export interface VeilDisclosedSecret {
  epoch: number;
  e: string;
  d: string;
  order: readonly number[];
  salt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const own = Object.keys(value);
  return (
    keys.every((key) => Object.hasOwn(value, key)) &&
    own.every((key) => keys.includes(key) || optional.includes(key))
  );
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === 'string' && value.length === length && /^[0-9a-f]+$/.test(value);
}

function isHexUpTo(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    value.length % 2 === 0 &&
    /^[0-9a-f]+$/.test(value)
  );
}

function isIndex(value: unknown, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function isDeck(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_DECK &&
    value.every((element) => isHex(element, ELEMENT_HEX))
  );
}

/** Absent (every seat shuffles) or a sorted, distinct, in-range seat list. */
function isParticipantList(value: unknown, seats: number): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length === 0 || value.length > seats) return false;
  const list = value as number[];
  return (
    list.every((seat) => isIndex(seat, seats) || seat === 0) &&
    list.every((seat) => Number.isInteger(seat) && seat >= 0 && seat < seats) &&
    new Set(list).size === list.length &&
    list.every((seat, index) => index === 0 || seat > list[index - 1]!)
  );
}

/**
 * A seat that shuffles carries a real key; a seat that does not carries none.
 *
 * The empty slot is what a house bot leaves behind. Uniqueness is checked over
 * the shuffling seats only, because several bots would otherwise collide on the
 * same empty string and sink an honest header.
 */
function hasShuffleKeys(keys: unknown[], participants: unknown, seats: number): boolean {
  const laying = Array.isArray(participants)
    ? (participants as number[])
    : Array.from({ length: seats }, (_, seat) => seat);
  const shuffling = laying.map((seat) => keys[seat]);
  return (
    shuffling.every((key) => isBoundedString(key, MAX_KEY)) &&
    new Set(shuffling as string[]).size === shuffling.length &&
    keys.every((key, seat) => laying.includes(seat) || key === '')
  );
}

export function isVeilRoundHeader(value: unknown): value is VeilRoundHeader {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['roundId', 'gameId', 'rulesHash', 'seats', 'keys', 'deck'],
      ['participants'],
    ) &&
    isBoundedString(value.roundId, MAX_ID) &&
    isBoundedString(value.gameId, MAX_ID) &&
    isHex(value.rulesHash, HASH_HEX) &&
    isIndex(value.seats, MAX_SEATS) &&
    (value.seats as number) >= 2 &&
    isParticipantList(value.participants, value.seats as number) &&
    Array.isArray(value.keys) &&
    value.keys.length === value.seats &&
    hasShuffleKeys(value.keys, value.participants, value.seats as number) &&
    Array.isArray(value.deck) &&
    value.deck.length > 0 &&
    value.deck.length <= MAX_DECK &&
    value.deck.every((card) => isBoundedString(card, MAX_ID)) &&
    new Set(value.deck as string[]).size === value.deck.length
  );
}

export function isVeilLayerEntry(value: unknown): value is VeilLayerEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['epoch', 'seat', 'deck', 'commitment']) &&
    isIndex(value.epoch, 64) &&
    isIndex(value.seat, MAX_SEATS - 1) &&
    isDeck(value.deck) &&
    isHex(value.commitment, HASH_HEX)
  );
}

function isSignedEntry(value: unknown): value is SignedVeilEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'seq',
      'kind',
      'seat',
      'signer',
      'previous',
      'payload',
      'hash',
      'signature',
    ]) &&
    isIndex(value.seq, 100_000) &&
    isBoundedString(value.kind, MAX_ID) &&
    isIndex(value.seat, MAX_SEATS - 1) &&
    isBoundedString(value.signer, MAX_KEY) &&
    isHex(value.previous, HASH_HEX) &&
    isHex(value.hash, HASH_HEX) &&
    isBoundedString(value.signature, MAX_SIGNATURE) &&
    ((value.kind === 'ceremony.layer' && isVeilLayerEntry(value.payload)) ||
      (value.kind === 'ceremony.recycle' && isVeilRecycleEntry(value.payload)))
  );
}

function isVeilRecycleEntry(value: unknown): value is VeilRecycleEntry {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['epoch', 'cards', 'participants']) &&
    isIndex(value.epoch, 64) &&
    Array.isArray(value.cards) &&
    value.cards.length > 0 &&
    value.cards.length <= MAX_DECK &&
    value.cards.every((card) => isBoundedString(card, MAX_ID)) &&
    new Set(value.cards as string[]).size === value.cards.length &&
    Array.isArray(value.participants) &&
    value.participants.length > 0 &&
    value.participants.length <= MAX_SEATS &&
    value.participants.every((seat) => isIndex(seat, MAX_SEATS - 1)) &&
    new Set(value.participants as number[]).size === value.participants.length
  );
}

export function isVeilShare(value: unknown): value is VeilShare {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['epoch', 'position', 'seat', 'value']) &&
    isIndex(value.epoch, 64) &&
    isIndex(value.position, MAX_DECK - 1) &&
    isIndex(value.seat, MAX_SEATS - 1) &&
    isHex(value.value, ELEMENT_HEX)
  );
}

function isRecoveryPackage(value: unknown): value is RecoveryPackage {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['seat', 'epoch', 'sealed', 'commitment', 'shares']) &&
    isIndex(value.seat, MAX_SEATS - 1) &&
    isIndex(value.epoch, 64) &&
    isHexUpTo(value.sealed, MAX_SEALED_HEX) &&
    isHex(value.commitment, HASH_HEX) &&
    Array.isArray(value.shares) &&
    value.shares.length > 0 &&
    value.shares.length <= MAX_SEATS &&
    value.shares.every(
      (share) =>
        isRecord(share) &&
        hasOnlyKeys(share, ['holder', 'share']) &&
        isIndex(share.holder, MAX_SEATS - 1) &&
        isHexUpTo(share.share, MAX_SHARE_HEX),
    )
  );
}

function isDisclosedSecret(value: unknown): value is VeilDisclosedSecret {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['epoch', 'e', 'd', 'order', 'salt']) &&
    isIndex(value.epoch, 64) &&
    isHexUpTo(value.e, ELEMENT_HEX) &&
    isHexUpTo(value.d, ELEMENT_HEX) &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_DECK &&
    value.order.every((index) => isIndex(index, MAX_DECK - 1)) &&
    new Set(value.order as number[]).size === value.order.length &&
    isHexUpTo(value.salt, 64)
  );
}

export function isVeilMessage(value: unknown): value is VeilMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'veil.hello':
      return (
        hasOnlyKeys(value, ['type', 'seat', 'publicKey']) &&
        isIndex(value.seat, MAX_SEATS - 1) &&
        isBoundedString(value.publicKey, MAX_KEY)
      );
    case 'veil.header':
      return hasOnlyKeys(value, ['type', 'header']) && isVeilRoundHeader(value.header);
    case 'veil.entry':
      return hasOnlyKeys(value, ['type', 'entry']) && isSignedEntry(value.entry);
    case 'veil.peel':
      return (
        hasOnlyKeys(value, ['type', 'epoch', 'position', 'forSeat', 'locked']) &&
        isIndex(value.epoch, 64) &&
        isIndex(value.position, MAX_DECK - 1) &&
        isIndex(value.forSeat, MAX_SEATS - 1) &&
        isHex(value.locked, ELEMENT_HEX)
      );
    case 'veil.share':
      return (
        hasOnlyKeys(value, ['type', 'share', 'forSeat', 'sequence']) &&
        isVeilShare(value.share) &&
        isIndex(value.forSeat, MAX_SEATS - 1) &&
        isIndex(value.sequence, MAX_SEATS - 1)
      );
    case 'veil.recovery':
      return hasOnlyKeys(value, ['type', 'pack']) && isRecoveryPackage(value.pack);
    case 'veil.recover.request':
      return (
        hasOnlyKeys(value, ['type', 'epoch', 'lostSeat']) &&
        isIndex(value.epoch, 64) &&
        isIndex(value.lostSeat, MAX_SEATS - 1)
      );
    case 'veil.recover.offer':
      return (
        hasOnlyKeys(value, ['type', 'epoch', 'lostSeat', 'holder', 'share']) &&
        isIndex(value.epoch, 64) &&
        isIndex(value.lostSeat, MAX_SEATS - 1) &&
        isIndex(value.holder, MAX_SEATS - 1) &&
        isHexUpTo(value.share, MAX_SHARE_HEX)
      );
    case 'veil.disclose':
      return (
        hasOnlyKeys(value, ['type', 'seat', 'secrets']) &&
        isIndex(value.seat, MAX_SEATS - 1) &&
        Array.isArray(value.secrets) &&
        value.secrets.length > 0 &&
        value.secrets.length <= 64 &&
        value.secrets.every(isDisclosedSecret)
      );
    case 'veil.catchup.request':
      return hasOnlyKeys(value, ['type']);
    case 'veil.catchup':
      return hasOnlyKeys(value, ['type', 'catchUp']) && isVeilCatchUp(value.catchUp);
    default:
      return false;
  }
}

/**
 * A replay of a whole round. Bounded by what a round can actually contain: one
 * header, one key per seat, and an entry budget that covers a long match's
 * epochs without letting a peer stream an unbounded chain at a returning seat.
 */
function isVeilCatchUp(value: unknown): value is VeilCatchUp {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['header', 'entries', 'keys']) &&
    isVeilRoundHeader(value.header) &&
    Array.isArray(value.entries) &&
    value.entries.length <= MAX_CATCH_UP_ENTRIES &&
    value.entries.every(isSignedEntry) &&
    Array.isArray(value.keys) &&
    value.keys.length <= MAX_SEATS &&
    value.keys.every(
      (key: unknown) =>
        isRecord(key) &&
        hasOnlyKeys(key, ['seat', 'publicKey']) &&
        isIndex(key.seat, MAX_SEATS - 1) &&
        isBoundedString(key.publicKey, MAX_KEY),
    ) &&
    new Set(value.keys.map((key) => (key as { seat: number }).seat)).size === value.keys.length
  );
}

export function parseVeilMessage(data: string): VeilMessage | null {
  if (data.length > 2_000_000) return null;
  try {
    const value: unknown = JSON.parse(data);
    return isVeilMessage(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Why a veil envelope or its inner message failed the schema, for the player
 * facing "malformed packet" report. Bounded and field-named, never a dump of
 * untrusted payload bytes.
 */
export function veilWireFault(value: unknown): string {
  if (!isRecord(value)) return 'veil';
  if (value.type === 'veil') {
    if (
      !hasOnlyKeys(value, ['type', 'to', 'message']) &&
      !hasOnlyKeys(value, ['type', 'message'])
    ) {
      return 'veil envelope';
    }
    if (value.to !== undefined && value.to !== null && !isBoundedString(value.to, MAX_ID)) {
      return 'veil.to';
    }
    return veilInnerFault(value.message);
  }
  if (typeof value.type === 'string' && value.type.startsWith('veil.')) {
    return veilInnerFault(value);
  }
  return keysLabel(value);
}

function keysLabel(value: Record<string, unknown>): string {
  const type =
    typeof value.type === 'string' ? value.type.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 32) : '';
  return type || 'veil';
}

function veilInnerFault(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== 'string') return 'veil.message';
  const type = value.type.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 32) || 'veil';
  if (isVeilMessage(value)) return type;
  switch (value.type) {
    case 'veil.header':
      return isRecord(value.header) ? headerFault(value.header) : 'veil.header';
    case 'veil.entry':
      return isRecord(value.entry) ? entryFault(value.entry) : 'veil.entry';
    case 'veil.hello':
      if (!isBoundedString(value.publicKey, MAX_KEY)) return 'veil.hello.key';
      return 'veil.hello';
    default:
      return type;
  }
}

function headerFault(header: Record<string, unknown>): string {
  if (!hasOnlyKeys(header, ['roundId', 'gameId', 'rulesHash', 'seats', 'keys', 'deck'])) {
    return 'veil.header.keys';
  }
  if (!isHex(header.rulesHash, HASH_HEX)) return 'veil.header.rulesHash';
  if (!Array.isArray(header.keys) || header.keys.length !== header.seats) {
    return 'veil.header.seats';
  }
  if (header.keys.some((key) => !isBoundedString(key, MAX_KEY))) return 'veil.header.key';
  if (new Set(header.keys as string[]).size !== header.keys.length) {
    return 'veil.header.duplicate-key';
  }
  if (!Array.isArray(header.deck) || header.deck.length === 0 || header.deck.length > MAX_DECK) {
    return 'veil.header.deck';
  }
  if (header.deck.some((card) => !isBoundedString(card, MAX_ID))) return 'veil.header.card';
  if (new Set(header.deck as string[]).size !== header.deck.length) {
    return 'veil.header.duplicate-card';
  }
  return 'veil.header';
}

function entryFault(entry: Record<string, unknown>): string {
  if (!isSignedEntry(entry)) {
    if (
      entry.kind === 'ceremony.layer' &&
      isRecord(entry.payload) &&
      Array.isArray(entry.payload.deck)
    ) {
      const bad = entry.payload.deck.find((card) => !isHex(card, ELEMENT_HEX));
      if (bad !== undefined) return 'veil.entry.deck';
    }
    if (typeof entry.previous === 'string' && !isHex(entry.previous, HASH_HEX)) {
      return 'veil.entry.previous';
    }
    if (typeof entry.hash === 'string' && !isHex(entry.hash, HASH_HEX)) return 'veil.entry.hash';
    if (typeof entry.signature === 'string' && !isBoundedString(entry.signature, MAX_SIGNATURE)) {
      return 'veil.entry.signature';
    }
    return 'veil.entry';
  }
  return 'veil.entry';
}
