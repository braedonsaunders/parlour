/**
 * Commutative encryption for the Parlour Veil shuffle (SRA, the classic mental
 * poker cipher).
 *
 * ## Why not the AES onion the design doc first sketched
 *
 * An onion of AES layers is peeled from the outside in, so *somebody* holds the
 * innermost layer and computes the plaintext. Under that construction the first
 * shuffler learns the face of every privately drawn card — which is exactly the
 * guarantee Veil is supposed to make ("no single participant can map the
 * encrypted deck to card faces"). The onion cannot deliver it.
 *
 * A commutative cipher can. `E_a(E_b(m)) = E_b(E_a(m))`, so the layers come off
 * in any order: to deal a card privately to a seat, every *other* seat removes
 * its own layer and passes the still-encrypted value along. Only the recipient
 * holds the last layer, so only the recipient ever sees the plaintext. No seat,
 * and no coalition short of everyone else, learns the card.
 *
 * SRA is that cipher: fix a large safe prime `p`, give each seat a secret
 * exponent `e` coprime to `p - 1`, and encrypt with `m^e mod p`. Decryption is
 * `c^d mod p` where `d = e⁻¹ mod (p - 1)`. Exponentiation commutes, so the deck
 * can be encrypted and permuted seat by seat and unwrapped in any order.
 *
 * ## What this does and does not prove
 *
 * SRA hides the mapping; it does not by itself prove that a seat *shuffled*
 * rather than substituted, or that a partial decryption was computed honestly.
 * Veil catches both after the fact: a bad partial decryption produces a value
 * that is not a legal card encoding and is rejected on the spot, and every seat
 * discloses its exponents at match end so the whole ceremony can be recomputed
 * and the deck checked for conservation. That is the difference between the
 * `verified` and `disputed` audit states — see audit.ts. It is detection, not
 * prevention, and the room UI must say so.
 */

import { bigIntToBytes, bytesToBigInt, randomBytes, toHex, utf8 } from './bytes';
import { sha256 } from './hash';

/**
 * RFC 3526 group 14 — a 2048-bit safe prime, so `p - 1 = 2q` with `q` prime and
 * an odd exponent is coprime to `p - 1` unless it happens to be a multiple of
 * `q`. Public and fixed: the security here comes from the secret exponents, not
 * from hiding the modulus.
 */
export const VEIL_PRIME = BigInt(
  '0x' +
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08' +
    '8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B' +
    '302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9' +
    'A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6' +
    '49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8' +
    'FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
    '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C' +
    '180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718' +
    '3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFF' +
    'FFFFFFFF',
);

const PRIME_MINUS_ONE = VEIL_PRIME - 1n;
const SOPHIE_GERMAIN = PRIME_MINUS_ONE / 2n;

/** Byte width of a group element — every value is transported at this width. */
export const VEIL_ELEMENT_BYTES = 256;

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus <= 0n) throw new Error('modulus must be positive');
  if (exponent < 0n) throw new Error('exponent must be non-negative');
  let result = 1n;
  let factor = base % modulus;
  if (factor < 0n) factor += modulus;
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    remaining >>= 1n;
  }
  return result;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Extended Euclid, used only to invert an exponent modulo `p - 1`. */
export function modInverse(value: bigint, modulus: bigint): bigint {
  let [old_r, r] = [((value % modulus) + modulus) % modulus, modulus];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }
  if (old_r !== 1n) throw new Error('value is not invertible for this modulus');
  return ((old_s % modulus) + modulus) % modulus;
}

/** One seat's secret shuffle layer. Never leaves the browser before the audit. */
export interface VeilLayerKey {
  /** encryption exponent */
  e: bigint;
  /** decryption exponent, `e⁻¹ mod (p - 1)` */
  d: bigint;
}

export function generateLayerKey(
  random: (length: number) => Uint8Array = randomBytes,
): VeilLayerKey {
  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate = bytesToBigInt(random(VEIL_ELEMENT_BYTES)) % PRIME_MINUS_ONE;
    if (candidate < 3n) continue;
    const e = candidate | 1n;
    if (e >= PRIME_MINUS_ONE || e === SOPHIE_GERMAIN) continue;
    if (gcd(e, PRIME_MINUS_ONE) !== 1n) continue;
    return { e, d: modInverse(e, PRIME_MINUS_ONE) };
  }
  throw new Error('could not draw a usable veil layer key');
}

export function encryptElement(value: bigint, key: Pick<VeilLayerKey, 'e'>): bigint {
  return modPow(value, key.e, VEIL_PRIME);
}

export function decryptElement(value: bigint, key: Pick<VeilLayerKey, 'd'>): bigint {
  return modPow(value, key.d, VEIL_PRIME);
}

export function elementToHex(value: bigint): string {
  return toHex(bigIntToBytes(value, VEIL_ELEMENT_BYTES));
}

export function elementFromHex(hex: string): bigint {
  if (hex.length !== VEIL_ELEMENT_BYTES * 2) throw new Error('not a veil group element');
  const value = bytesToBigInt(hexToBytes(hex));
  if (value <= 0n || value >= VEIL_PRIME) throw new Error('element is outside the group');
  return value;
}

function hexToBytes(hex: string): Uint8Array {
  if (/[^0-9a-f]/.test(hex)) throw new Error('not a lowercase hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Deterministic group element for a card.
 *
 * Squaring forces the value into the quadratic residues. SRA leaks the
 * Legendre symbol — encryption preserves it for odd exponents — so a deck of
 * mixed residues would let anyone split the cards into two visible halves
 * before a single layer came off. Encoding every card as a residue removes the
 * distinction entirely.
 */
export async function encodeCard(roundId: string, cardId: string): Promise<bigint> {
  for (let counter = 0; counter < 64; counter++) {
    const digest = await sha256(utf8(`parlour.veil/card\n${roundId}\n${cardId}\n${counter}`));
    const base = bytesToBigInt(digest) % VEIL_PRIME;
    if (base <= 1n) continue;
    const encoded = (base * base) % VEIL_PRIME;
    if (encoded > 1n) return encoded;
  }
  throw new Error(`could not encode card ${cardId}`);
}

/** Two-way map between card ids and their group elements for one round. */
export interface VeilCodebook {
  roundId: string;
  cardIds: readonly string[];
  elementOf: ReadonlyMap<string, bigint>;
  cardOf: ReadonlyMap<string, string>;
}

export async function buildCodebook(
  roundId: string,
  cardIds: readonly string[],
): Promise<VeilCodebook> {
  const elementOf = new Map<string, bigint>();
  const cardOf = new Map<string, string>();
  for (const cardId of cardIds) {
    const element = await encodeCard(roundId, cardId);
    const hex = elementToHex(element);
    if (cardOf.has(hex)) throw new Error(`card encoding collision on ${cardId}`);
    elementOf.set(cardId, element);
    cardOf.set(hex, cardId);
  }
  return { roundId, cardIds: [...cardIds], elementOf, cardOf };
}

/** Reads a fully decrypted element back to a card id, or null if it is not one. */
export function decodeCard(codebook: VeilCodebook, element: bigint): string | null {
  return codebook.cardOf.get(elementToHex(element)) ?? null;
}

/**
 * A uniform permutation drawn from the CSPRNG. Modulo bias is avoided by
 * rejection sampling, because a biased shuffle is a readable shuffle.
 */
export function randomPermutation(
  size: number,
  random: (length: number) => Uint8Array = randomBytes,
): number[] {
  const order = Array.from({ length: size }, (_, index) => index);
  for (let index = size - 1; index > 0; index--) {
    const pick = uniformBelow(index + 1, random);
    const swap = order[index] as number;
    order[index] = order[pick] as number;
    order[pick] = swap;
  }
  return order;
}

function uniformBelow(bound: number, random: (length: number) => Uint8Array): number {
  if (bound <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / bound) * bound;
  for (let attempt = 0; attempt < 128; attempt++) {
    const bytes = random(4);
    const value =
      ((bytes[0] as number) << 24) |
      ((bytes[1] as number) << 16) |
      ((bytes[2] as number) << 8) |
      (bytes[3] as number);
    const unsigned = value >>> 0;
    if (unsigned < limit) return unsigned % bound;
  }
  throw new Error('rejection sampling failed to terminate');
}

export function applyPermutation<T>(items: readonly T[], order: readonly number[]): T[] {
  if (items.length !== order.length) throw new Error('permutation size mismatch');
  return order.map((from) => {
    const item = items[from];
    if (item === undefined) throw new Error('permutation is not a bijection');
    return item;
  });
}

export function invertPermutation(order: readonly number[]): number[] {
  const inverse = new Array<number>(order.length).fill(-1);
  order.forEach((from, to) => {
    inverse[from] = to;
  });
  if (inverse.some((value) => value < 0)) throw new Error('permutation is not a bijection');
  return inverse;
}

/** Encrypt every element with one seat's layer, then permute. */
export function shuffleLayer(
  deck: readonly bigint[],
  key: Pick<VeilLayerKey, 'e'>,
  order: readonly number[],
): bigint[] {
  return applyPermutation(
    deck.map((element) => encryptElement(element, key)),
    order,
  );
}

/**
 * How many elements to encrypt before letting the page breathe.
 *
 * A 2048-bit modular exponentiation is not slow; a deck of them in one
 * uninterrupted run is. On a phone that run is long enough to starve the
 * heartbeat timer, and a seat that misses enough heartbeats is declared gone —
 * so a table could lose a player *to its own shuffle*. Yielding costs a few
 * milliseconds of ceremony and buys back the timers.
 */
const SHUFFLE_CHUNK = 8;

/** Lets pending timers and messages run. A microtask would not: they are tasks. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * {@link shuffleLayer}, in chunks, so the event loop keeps turning underneath a
 * long ceremony. Identical output — the same deck, the same permutation.
 */
export async function shuffleLayerAsync(
  deck: readonly bigint[],
  key: Pick<VeilLayerKey, 'e'>,
  order: readonly number[],
): Promise<bigint[]> {
  const encrypted: bigint[] = [];
  for (const [index, element] of deck.entries()) {
    encrypted.push(encryptElement(element, key));
    if ((index + 1) % SHUFFLE_CHUNK === 0) await yieldToEventLoop();
  }
  return applyPermutation(encrypted, order);
}
