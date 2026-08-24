/**
 * Shamir secret sharing over GF(256), used only for Veil's disconnect recovery.
 *
 * A seat that vanishes mid-round takes its layer key with it, and without that
 * key nothing it touched can ever be opened — the round would be stuck. So each
 * seat wraps its layer secrets under a random recovery key and splits that key
 * among the *other* seats before play starts. A quorum can put a missing seat's
 * layer back together; anything short of the threshold learns nothing at all.
 *
 * This is the sharp edge of Veil and the room has to say so out loud: a lower
 * threshold recovers more reliably, a higher one resists collusion better, and
 * at two seats there is no honest setting — see recovery.ts.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let value = 1;
  for (let index = 0; index < 255; index++) {
    EXP[index] = value;
    LOG[value] = index;
    // multiply by the generator 0x03 in GF(2^8) with the AES polynomial
    value ^= (value << 1) ^ (value & 0x80 ? 0x11b : 0);
    value &= 0xff;
  }
  for (let index = 255; index < 512; index++) EXP[index] = EXP[index - 255] as number;
})();

function mul(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return EXP[(LOG[left] as number) + (LOG[right] as number)] as number;
}

function div(left: number, right: number): number {
  if (right === 0) throw new Error('division by zero in GF(256)');
  if (left === 0) return 0;
  return EXP[(LOG[left] as number) + 255 - (LOG[right] as number)] as number;
}

export interface SecretShare {
  /** x coordinate, 1-255; 0 is the secret itself and is never handed out */
  x: number;
  y: Uint8Array;
}

/**
 * Splits `secret` into `shares` pieces, any `threshold` of which reconstruct it.
 */
export function splitSecret(
  secret: Uint8Array,
  shares: number,
  threshold: number,
  random: (length: number) => Uint8Array,
): SecretShare[] {
  if (!Number.isInteger(shares) || shares < 1 || shares > 255) {
    throw new Error('share count must be 1-255');
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > shares) {
    throw new Error('threshold must be between 1 and the share count');
  }
  if (secret.length === 0) throw new Error('cannot split an empty secret');

  const coefficients: Uint8Array[] = [];
  for (let degree = 1; degree < threshold; degree++) coefficients.push(random(secret.length));

  const out: SecretShare[] = [];
  for (let index = 0; index < shares; index++) {
    const x = index + 1;
    const y = new Uint8Array(secret.length);
    for (let byte = 0; byte < secret.length; byte++) {
      // Horner from the top coefficient down to the secret at the constant term.
      let accumulated = 0;
      for (let degree = threshold - 2; degree >= 0; degree--) {
        accumulated = mul(accumulated, x) ^ ((coefficients[degree] as Uint8Array)[byte] as number);
      }
      y[byte] = mul(accumulated, x) ^ (secret[byte] as number);
    }
    out.push({ x, y });
  }
  return out;
}

/** Lagrange interpolation at x=0 over any `threshold` distinct shares. */
export function combineShares(shares: readonly SecretShare[]): Uint8Array {
  if (shares.length === 0) throw new Error('need at least one share');
  const length = (shares[0] as SecretShare).y.length;
  const xs = new Set<number>();
  for (const share of shares) {
    if (!Number.isInteger(share.x) || share.x < 1 || share.x > 255) {
      throw new Error('share x must be 1-255');
    }
    if (share.y.length !== length) throw new Error('shares have different lengths');
    if (xs.has(share.x)) throw new Error('shares must have distinct x coordinates');
    xs.add(share.x);
  }

  const secret = new Uint8Array(length);
  for (let byte = 0; byte < length; byte++) {
    let total = 0;
    for (let i = 0; i < shares.length; i++) {
      const self = shares[i] as SecretShare;
      let basis = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        const other = shares[j] as SecretShare;
        basis = mul(basis, div(other.x, self.x ^ other.x));
      }
      total ^= mul(self.y[byte] as number, basis);
    }
    secret[byte] = total;
  }
  return secret;
}
