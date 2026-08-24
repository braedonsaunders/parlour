import { fromBase64Url, toBase64Url, utf8 } from './bytes';
import { canonicalJson } from './hash';

/**
 * Ephemeral room identities.
 *
 * Each seat mints a P-256 signing key for the round and nothing else. The
 * long-lived profile id in localStorage stays what it always was — a label for
 * seat reclaim and head-to-head history — and is never a cryptographic key, so
 * a stolen transcript proves nothing about a person, only about a seat in one
 * round.
 */
export interface VeilIdentity {
  /** base64url SPKI — the seat's public key, quoted in the round header */
  publicKey: string;
  privateKey: CryptoKey;
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;

export async function createIdentity(): Promise<VeilIdentity> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return { publicKey: toBase64Url(new Uint8Array(spki)), privateKey: pair.privateKey };
}

const verifyKeyCache = new Map<string, Promise<CryptoKey | null>>();

async function importVerifyKey(publicKey: string): Promise<CryptoKey | null> {
  const cached = verifyKeyCache.get(publicKey);
  if (cached) return cached;
  const pending = (async () => {
    try {
      return await crypto.subtle.importKey(
        'spki',
        fromBase64Url(publicKey) as BufferSource,
        ALGORITHM,
        true,
        ['verify'],
      );
    } catch {
      return null;
    }
  })();
  verifyKeyCache.set(publicKey, pending);
  return pending;
}

/** Signs the canonical bytes of a value under a domain-separated tag. */
export async function signValue(
  identity: VeilIdentity,
  tag: string,
  value: unknown,
): Promise<string> {
  const bytes = utf8(`parlour.veil/${tag}\n${canonicalJson(value)}`);
  const signature = await crypto.subtle.sign(SIGNATURE, identity.privateKey, bytes as BufferSource);
  return toBase64Url(new Uint8Array(signature));
}

/** Never throws: a malformed key or signature from the wire is simply false. */
export async function verifyValue(
  publicKey: string,
  tag: string,
  value: unknown,
  signature: string,
): Promise<boolean> {
  const key = await importVerifyKey(publicKey);
  if (!key) return false;
  let signatureBytes: Uint8Array;
  let payload: Uint8Array;
  try {
    signatureBytes = fromBase64Url(signature);
    payload = utf8(`parlour.veil/${tag}\n${canonicalJson(value)}`);
  } catch {
    return false;
  }
  try {
    return await crypto.subtle.verify(
      SIGNATURE,
      key,
      signatureBytes as BufferSource,
      payload as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Test seam: drops cached verify keys so a suite can reuse key material. */
export function resetVerifyKeyCache(): void {
  verifyKeyCache.clear();
}
