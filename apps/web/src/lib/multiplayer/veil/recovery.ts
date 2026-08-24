/**
 * Disconnect recovery, and the trade-off it forces.
 *
 * Veil's privacy comes from every seat holding a layer key nobody else has.
 * That is also the failure mode: a seat that drops takes its key with it, and
 * every card still locked under that layer becomes unopenable. Recovery hands a
 * *threshold* of the other seats enough material to rebuild a missing layer.
 *
 * There is no free version of this. The threshold is exactly the number of
 * seats who, if they colluded, could open a live player's hand. At three or
 * four seats you can pick a genuinely useful point on that curve. At two seats
 * you cannot: any recovery share you give your opponent is a share that lets
 * your opponent read your hand, so a two-seat Veil room recovers nothing and
 * pauses instead. {@link recoveryPolicyFor} returns that answer rather than
 * quietly picking a threshold of one.
 */

import { concatBytes, fromHex, randomBytes, toHex, utf8 } from './bytes';
import { canonicalJson } from './hash';
import { combineShares, splitSecret, type SecretShare } from './shamir';
import type { VeilLayerSecret } from './ceremony';

export type RecoveryMode = 'none' | 'threshold';

export interface RecoveryPolicy {
  mode: RecoveryMode;
  /** how many other seats must combine to reopen a missing seat's layer */
  threshold: number;
  /** how many seats hold a share */
  holders: number;
  /** plain-language statement of what this costs, shown in the room badge */
  disclosure: string;
}

/**
 * `strength` moves along the collusion/recovery curve: 'balanced' needs a
 * majority of the remaining seats, 'private' needs all of them (maximum
 * collusion resistance, minimum chance of recovering), 'forgiving' needs one
 * (recovers almost always, and means any single opponent could have read your
 * hand — which the disclosure says outright).
 */
export function recoveryPolicyFor(
  seats: number,
  strength: 'balanced' | 'private' | 'forgiving' = 'balanced',
): RecoveryPolicy {
  const holders = Math.max(0, seats - 1);
  if (seats < 3) {
    return {
      mode: 'none',
      threshold: 0,
      holders,
      disclosure:
        'Two-seat Veil cannot recover a disconnect. Handing your opponent enough ' +
        'key material to resume would also let them read your hand, so a dropped ' +
        'player pauses the round instead.',
    };
  }
  // 'balanced' never drops to one holder: a threshold of one means a single
  // opponent can open a live hand, which is the 'forgiving' bargain, not the
  // default one.
  const threshold =
    strength === 'private'
      ? holders
      : strength === 'forgiving'
        ? 1
        : Math.max(2, Math.ceil(holders / 2));
  const settled = Math.min(Math.max(threshold, 1), holders);
  return {
    mode: 'threshold',
    threshold: settled,
    holders,
    disclosure:
      settled === 1
        ? `Any single other player can restore a dropped seat's cards — which means any ` +
          `single other player could also open a live hand. Choose a higher setting for a ` +
          `competitive room.`
        : `${settled} of the other ${holders} players must agree to restore a dropped seat's ` +
          `cards. The same ${settled} could, if they all colluded, open a live hand.`,
  };
}

/** A seat's layer secrets, sealed under a key that is then split. */
export interface RecoveryPackage {
  seat: number;
  epoch: number;
  /** AES-GCM iv + ciphertext, hex */
  sealed: string;
  /** commits to the sealed blob so a seat cannot swap it later */
  commitment: string;
  shares: readonly { holder: number; share: string }[];
}

function encodeSecret(secret: VeilLayerSecret): Uint8Array {
  return utf8(
    canonicalJson({
      epoch: secret.epoch,
      e: secret.key.e.toString(16),
      d: secret.key.d.toString(16),
      order: [...secret.order],
      salt: secret.salt,
    }),
  );
}

function decodeSecret(bytes: Uint8Array): VeilLayerSecret {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    epoch: number;
    e: string;
    d: string;
    order: number[];
    salt: string;
  };
  return {
    epoch: parsed.epoch,
    key: { e: BigInt(`0x${parsed.e}`), d: BigInt(`0x${parsed.d}`) },
    order: parsed.order,
    salt: parsed.salt,
  };
}

/**
 * Seals a layer secret and splits the sealing key across the other seats.
 * Returns nothing when the policy says this room does not recover.
 */
export async function packageRecovery(
  secret: VeilLayerSecret,
  seat: number,
  policy: RecoveryPolicy,
  holderSeats: readonly number[],
  random: (length: number) => Uint8Array = randomBytes,
): Promise<RecoveryPackage | null> {
  if (policy.mode === 'none' || holderSeats.length === 0) return null;
  const recoveryKey = random(32);
  const iv = random(12);
  const key = await crypto.subtle.importKey('raw', recoveryKey as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encodeSecret(secret) as BufferSource,
    ),
  );
  const sealed = toHex(concatBytes(iv, ciphertext));
  const pieces = splitSecret(recoveryKey, holderSeats.length, policy.threshold, random);
  const { sha256Hex } = await import('./hash');
  return {
    seat,
    epoch: secret.epoch,
    sealed,
    commitment: await sha256Hex(utf8('parlour.veil/recovery\n'), fromHex(sealed)),
    shares: holderSeats.map((holder, index) => {
      const piece = pieces[index] as SecretShare;
      return { holder, share: `${piece.x.toString(16).padStart(2, '0')}${toHex(piece.y)}` };
    }),
  };
}

function parseShare(encoded: string): SecretShare {
  if (encoded.length < 4 || encoded.length % 2 !== 0) throw new Error('malformed recovery share');
  const bytes = fromHex(encoded);
  const x = bytes[0] as number;
  if (x < 1) throw new Error('malformed recovery share');
  return { x, y: bytes.slice(1) };
}

export type RecoveryFault =
  | { code: 'below-threshold'; message: string }
  | { code: 'tampered'; message: string }
  | { code: 'undecryptable'; message: string };

/** Rebuilds a missing seat's layer from a quorum of shares. */
export async function recoverLayer(
  pack: RecoveryPackage,
  offered: readonly string[],
  policy: RecoveryPolicy,
): Promise<VeilLayerSecret | RecoveryFault> {
  if (policy.mode === 'none') {
    return { code: 'below-threshold', message: 'this room does not recover disconnects' };
  }
  if (offered.length < policy.threshold) {
    return {
      code: 'below-threshold',
      message: `recovery needs ${policy.threshold} shares, has ${offered.length}`,
    };
  }
  const { sha256Hex } = await import('./hash');
  let sealedBytes: Uint8Array;
  try {
    sealedBytes = fromHex(pack.sealed);
  } catch {
    return { code: 'tampered', message: 'the sealed layer is not readable' };
  }
  const commitment = await sha256Hex(utf8('parlour.veil/recovery\n'), sealedBytes);
  if (commitment !== pack.commitment) {
    return { code: 'tampered', message: 'the sealed layer does not match its commitment' };
  }

  let recoveryKey: Uint8Array;
  try {
    recoveryKey = combineShares(offered.slice(0, policy.threshold).map(parseShare));
  } catch {
    return { code: 'tampered', message: 'the offered recovery shares are malformed' };
  }
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      recoveryKey as BufferSource,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: sealedBytes.slice(0, 12) as BufferSource },
        key,
        sealedBytes.slice(12) as BufferSource,
      ),
    );
    return decodeSecret(plain);
  } catch {
    return {
      code: 'undecryptable',
      message: 'the quorum did not reconstruct the sealing key — a share was wrong',
    };
  }
}
