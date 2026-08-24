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

const MAX_SEATS = 8;
const MAX_DECK = 256;
const MAX_KEY = 256;
const MAX_SIGNATURE = 256;
const MAX_ID = 128;
const HASH_HEX = 64;
const ELEMENT_HEX = VEIL_ELEMENT_BYTES * 2;
const MAX_SEALED_HEX = 8_192;
const MAX_SHARE_HEX = 1_024;

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
  | { type: 'veil.disclose'; seat: number; secrets: readonly VeilDisclosedSecret[] };

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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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

export function isVeilRoundHeader(value: unknown): value is VeilRoundHeader {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['roundId', 'gameId', 'rulesHash', 'seats', 'keys', 'deck']) &&
    isBoundedString(value.roundId, MAX_ID) &&
    isBoundedString(value.gameId, MAX_ID) &&
    isHex(value.rulesHash, HASH_HEX) &&
    isIndex(value.seats, MAX_SEATS) &&
    (value.seats as number) >= 2 &&
    Array.isArray(value.keys) &&
    value.keys.length === value.seats &&
    value.keys.every((key) => isBoundedString(key, MAX_KEY)) &&
    new Set(value.keys as string[]).size === value.keys.length &&
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
    // The only entry payload Veil carries today is a ceremony layer; anything
    // else is rejected rather than passed through as opaque JSON.
    (value.kind !== 'ceremony.layer' || isVeilLayerEntry(value.payload))
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
    default:
      return false;
  }
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
