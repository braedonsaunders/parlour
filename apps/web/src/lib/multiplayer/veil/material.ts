/**
 * Round material a seat can rebuild after a disconnect.
 *
 * A veiled round cannot continue without every seat's layer: each peel chain
 * needs all of them, so one missing seat blocks everyone's cards, not just its
 * own. Until now a seat's layer lived only in memory, and a returning player
 * minted a fresh identity and a fresh secret — which is not the same seat as
 * far as the transcript is concerned. That is why a disconnect could only be
 * answered by threshold recovery, which hands somebody else enough key material
 * to read a live hand, or by pausing the round forever at two seats.
 *
 * So the layer stops being drawn and starts being *derived*. Every random byte
 * a layer is built from — the exponent, the permutation, the salt — comes from
 * a stream keyed by one per-room master seed and the epoch number. Come back to
 * the same room and the same bytes come back with you: the same exponent, the
 * same permutation, the same commitment. The round resumes with **no privacy
 * loss at all**, because nobody else ever held anything.
 *
 * `generateLayerKey` and `randomPermutation` already took an injectable byte
 * source, so nothing about the cryptography changes here. The same layer is
 * laid; it is simply reproducible by the one seat entitled to reproduce it.
 *
 * **Where this is kept, and what that means.** The master seed and the round's
 * signing key are held in `localStorage` for the life of the room. Anyone who
 * can read that storage can rebuild the layer — but they are already sitting in
 * front of a browser holding the hand in memory, so this concedes nothing that
 * was not already conceded. It is cleared when the room ends.
 */

import { fromBase64Url, fromHex, toBase64Url, toHex, utf8 } from './bytes';
import { restoreIdentity, createIdentity, exportIdentity, type VeilIdentity } from './signing';

const STORAGE_PREFIX = 'parlour.veil.round.';
const MASTER_SEED_BYTES = 32;
/**
 * HKDF-SHA-256 emits at most 255 × 32 bytes per call, so the stream is built
 * from a handful of them. A layer needs a few hundred bytes in the ordinary
 * case — one 256-byte exponent draw, a permutation, a 16-byte salt — and the
 * budget here is far past the worst case of 64 rejected exponents.
 */
const STREAM_CHUNK_BYTES = 8_160;
const STREAM_CHUNKS = 8;

export interface VeilRoundMaterial {
  roomCode: string;
  /** the profile this material belongs to */
  owner: string;
  /** hex, the root every layer in this room is derived from */
  masterSeed: string;
  identity: VeilIdentity;
}

interface StoredMaterial {
  masterSeed: string;
  privateKey: string;
  publicKey: string;
}

/**
 * Keyed by room *and* by whose material it is.
 *
 * A room alone is not enough: two seats sharing one browser profile — a test
 * harness, a shared machine, two tabs — would otherwise restore each other's
 * identity and sign as the wrong seat.
 */
function storageKey(roomCode: string, owner: string): string {
  return `${STORAGE_PREFIX}${roomCode}:${owner}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private browsing modes throw rather than returning null.
    return null;
  }
}

function randomSeed(): string {
  const bytes = new Uint8Array(MASTER_SEED_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The material for this room, restored if this seat has been here before.
 *
 * Restoring is what makes a reconnect a *resume*. A fresh room mints a new
 * seed, so nothing is shared between rooms and a transcript from one proves
 * nothing about another.
 */
export async function loadRoundMaterial(
  roomCode: string,
  owner: string,
): Promise<VeilRoundMaterial> {
  const store = storage();
  const raw = store?.getItem(storageKey(roomCode, owner));
  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredMaterial;
      if (stored.masterSeed && stored.privateKey && stored.publicKey) {
        return {
          roomCode,
          owner,
          masterSeed: stored.masterSeed,
          identity: await restoreIdentity(stored.privateKey, stored.publicKey),
        };
      }
    } catch {
      // Unreadable material is replaced rather than trusted.
    }
  }
  const material: VeilRoundMaterial = {
    roomCode,
    owner,
    masterSeed: randomSeed(),
    identity: await createIdentity(),
  };
  await saveRoundMaterial(material);
  return material;
}

export async function saveRoundMaterial(material: VeilRoundMaterial): Promise<void> {
  const store = storage();
  if (!store) return;
  const stored: StoredMaterial = {
    masterSeed: material.masterSeed,
    privateKey: await exportIdentity(material.identity),
    publicKey: material.identity.publicKey,
  };
  try {
    store.setItem(storageKey(material.roomCode, material.owner), JSON.stringify(stored));
  } catch {
    // A full or blocked store costs reconnection, not correctness.
  }
}

/** Forgets a room's material. Called when the room ends, not when it drops. */
export function clearRoundMaterial(roomCode: string, owner: string): void {
  try {
    storage()?.removeItem(storageKey(roomCode, owner));
  } catch {
    // Nothing to do; the material expires with the browser profile.
  }
}

/**
 * The byte stream one epoch's layer is built from.
 *
 * Deterministic in `(masterSeed, roomCode, epoch)` and nothing else, so the
 * same seat rebuilds the same layer and no other seat can rebuild any of it.
 * The whole stream is expanded up front because the consumers
 * (`generateLayerKey`, `randomPermutation`) are synchronous, and it is drawn in
 * the same order every time, so a replay consumes exactly what the first pass
 * did.
 */
export async function layerStream(
  masterSeed: string,
  roomCode: string,
  epoch: number,
): Promise<(length: number) => Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromHex(masterSeed) as BufferSource,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const salt = utf8(`parlour.veil/layer|${roomCode}`);
  const chunks: Uint8Array[] = [];
  for (let chunk = 0; chunk < STREAM_CHUNKS; chunk++) {
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as BufferSource,
        info: utf8(`epoch:${epoch}|chunk:${chunk}`) as BufferSource,
      },
      key,
      STREAM_CHUNK_BYTES * 8,
    );
    chunks.push(new Uint8Array(bits));
  }
  const stream = new Uint8Array(STREAM_CHUNKS * STREAM_CHUNK_BYTES);
  chunks.forEach((chunk, index) => stream.set(chunk, index * STREAM_CHUNK_BYTES));

  let cursor = 0;
  return (length: number) => {
    if (cursor + length > stream.length) {
      // Reproducibility is the whole point, so running dry has to be loud: a
      // silent wrap would hand back a different layer than the first pass.
      throw new Error('veil layer stream exhausted');
    }
    const slice = stream.slice(cursor, cursor + length);
    cursor += length;
    return slice;
  };
}

/** Base64url helpers re-exported for the material's callers. */
export { fromBase64Url, toBase64Url };
