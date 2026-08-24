import { describe, expect, it } from 'vitest';
import { combineShares, splitSecret, type SecretShare } from './shamir';
import { randomBytes } from './bytes';

const SECRET = new Uint8Array([1, 2, 3, 250, 255, 0, 128, 64]);

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((tail) => [head as T, ...tail]),
    ...combinations(rest, size),
  ];
}

describe('shamir over GF(256)', () => {
  it('reconstructs from exactly the threshold, in any combination', () => {
    const shares = splitSecret(SECRET, 4, 3, randomBytes);
    for (const quorum of combinations(shares, 3)) {
      expect([...combineShares(quorum)]).toEqual([...SECRET]);
    }
  });

  it('reconstructs from more than the threshold', () => {
    const shares = splitSecret(SECRET, 4, 2, randomBytes);
    expect([...combineShares(shares)]).toEqual([...SECRET]);
  });

  it('tells nothing to a coalition below the threshold', () => {
    const shares = splitSecret(SECRET, 4, 3, randomBytes);
    for (const short of combinations(shares, 2)) {
      expect([...combineShares(short)]).not.toEqual([...SECRET]);
    }
  });

  it('handles a threshold of one as a plain copy of the secret', () => {
    const shares = splitSecret(SECRET, 3, 1, randomBytes);
    for (const share of shares) expect([...share.y]).toEqual([...SECRET]);
  });

  it('survives a full-width random secret', () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 5, 3, randomBytes);
    expect([...combineShares(shares.slice(1, 4))]).toEqual([...secret]);
  });

  it('rejects nonsense parameters', () => {
    expect(() => splitSecret(SECRET, 0, 1, randomBytes)).toThrow(/share count/);
    expect(() => splitSecret(SECRET, 3, 4, randomBytes)).toThrow(/threshold/);
    expect(() => splitSecret(new Uint8Array(), 3, 2, randomBytes)).toThrow(/empty secret/);
  });

  it('rejects malformed or duplicated shares rather than returning garbage', () => {
    const shares = splitSecret(SECRET, 3, 2, randomBytes);
    const first = shares[0] as SecretShare;
    expect(() => combineShares([first, first])).toThrow(/distinct x/);
    expect(() => combineShares([first, { x: 0, y: first.y }])).toThrow(/x must be/);
    expect(() => combineShares([first, { x: 2, y: new Uint8Array(3) }])).toThrow(
      /different lengths/,
    );
    expect(() => combineShares([])).toThrow(/at least one share/);
  });
});
