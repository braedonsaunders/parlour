import { concatBytes, toHex, utf8 } from './bytes';

/**
 * Canonical JSON — the exact bytes every peer must agree on before hashing or
 * signing. Object keys are sorted, `undefined` members are dropped, and only
 * JSON-safe scalars are accepted, so two honest peers cannot produce different
 * bytes for the same value and a hostile peer cannot smuggle one past a
 * signature check.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('canonical json cannot encode a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source)
      .filter((key) => source[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(',')}}`;
  }
  throw new Error(`canonical json cannot encode ${typeof value}`);
}

export async function sha256(...parts: readonly Uint8Array[]): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', concatBytes(...parts) as BufferSource);
  return new Uint8Array(digest);
}

export async function sha256Hex(...parts: readonly Uint8Array[]): Promise<string> {
  return toHex(await sha256(...parts));
}

/**
 * Domain-separated hash of a structured value. The tag keeps a digest computed
 * for one purpose (a transcript entry) from ever being replayable as another
 * (a deck commitment).
 */
export async function hashTagged(tag: string, value: unknown): Promise<string> {
  return sha256Hex(utf8(`parlour.veil/${tag}\n`), utf8(canonicalJson(value)));
}

/** Merkle root over an ordered list of leaf digests (odd nodes carry up). */
export async function merkleRoot(leaves: readonly Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) return sha256(utf8('parlour.veil/empty-merkle'));
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index] as Uint8Array;
      const right = level[index + 1];
      next.push(right ? await sha256(utf8('n'), left, right) : await sha256(utf8('n'), left, left));
    }
    level = next;
  }
  return level[0] as Uint8Array;
}

export type MerkleProof = readonly { sibling: string; right: boolean }[];

/** Inclusion path for `index`, as hex siblings from the leaf upward. */
export async function merkleProof(
  leaves: readonly Uint8Array[],
  index: number,
): Promise<MerkleProof> {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error('merkle proof index is out of range');
  }
  const path: { sibling: string; right: boolean }[] = [];
  let level = leaves.slice();
  let cursor = index;
  while (level.length > 1) {
    const isRight = cursor % 2 === 1;
    const siblingIndex = isRight ? cursor - 1 : Math.min(cursor + 1, level.length - 1);
    path.push({ sibling: toHex(level[siblingIndex] as Uint8Array), right: !isRight });
    const next: Uint8Array[] = [];
    for (let at = 0; at < level.length; at += 2) {
      const left = level[at] as Uint8Array;
      const right = level[at + 1];
      next.push(right ? await sha256(utf8('n'), left, right) : await sha256(utf8('n'), left, left));
    }
    level = next;
    cursor = Math.floor(cursor / 2);
  }
  return path;
}

export async function merkleVerify(
  leaf: Uint8Array,
  proof: MerkleProof,
  root: string,
): Promise<boolean> {
  const { fromHex } = await import('./bytes');
  let current = leaf;
  for (const step of proof) {
    const sibling = fromHex(step.sibling);
    current = step.right
      ? await sha256(utf8('n'), current, sibling)
      : await sha256(utf8('n'), sibling, current);
  }
  return toHex(current) === root;
}
