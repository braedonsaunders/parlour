import { describe, expect, it } from 'vitest';
import type { SeatId } from '@parlour/engine';
import {
  createDealNonce,
  dealCommitment,
  DealSeedRound,
  isDealDigest,
  mixDealSeed,
  rematchDealSeed,
} from './dealSeed';

const ROOM = 'ABCD';

async function roundOf(nonces: readonly string[], roomCode = ROOM): Promise<DealSeedRound> {
  const round = new DealSeedRound();
  for (const [index, nonce] of nonces.entries()) {
    const seat = index as SeatId;
    round.recordCommitment(seat, await dealCommitment(roomCode, seat, nonce));
    round.recordContribution(seat, nonce);
  }
  return round;
}

describe('deal seed contributions', () => {
  it('mints nonces of the shape the wire accepts', () => {
    const nonce = createDealNonce();
    expect(isDealDigest(nonce)).toBe(true);
    expect(nonce).not.toBe(createDealNonce());
  });

  it('rejects anything that is not a 32-byte lowercase hex digest', () => {
    expect(isDealDigest('AB'.repeat(32))).toBe(false);
    expect(isDealDigest('zz'.repeat(32))).toBe(false);
    expect(isDealDigest('ab'.repeat(31))).toBe(false);
    expect(isDealDigest(null)).toBe(false);
  });

  it('binds a commitment to its room and seat so it cannot be replayed elsewhere', async () => {
    const nonce = createDealNonce();
    const mine = await dealCommitment(ROOM, 0, nonce);
    expect(await dealCommitment('WXYZ', 0, nonce)).not.toBe(mine);
    expect(await dealCommitment(ROOM, 1, nonce)).not.toBe(mine);
    expect(await dealCommitment(ROOM, 0, nonce)).toBe(mine);
  });
});

describe('mixing the shuffle', () => {
  it('agrees on a seed no matter what order the reveals arrived in', async () => {
    const a = createDealNonce();
    const b = createDealNonce();
    expect(
      await mixDealSeed(ROOM, [
        { seat: 1, nonce: b },
        { seat: 0, nonce: a },
      ]),
    ).toBe(
      await mixDealSeed(ROOM, [
        { seat: 0, nonce: a },
        { seat: 1, nonce: b },
      ]),
    );
  });

  it('gives a seed the wire will carry', async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const seed = await mixDealSeed(ROOM, [{ seat: 0, nonce: createDealNonce() }]);
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it('moves when any single seat changes its share', async () => {
    const fixed = createDealNonce();
    const first = await mixDealSeed(ROOM, [
      { seat: 0, nonce: fixed },
      { seat: 1, nonce: createDealNonce() },
    ]);
    const second = await mixDealSeed(ROOM, [
      { seat: 0, nonce: fixed },
      { seat: 1, nonce: createDealNonce() },
    ]);
    expect(first).not.toBe(second);
  });
});

describe('rematch seed chaining', () => {
  it('gives every peer the same fresh unsigned deal without a host reroll', async () => {
    const first = await rematchDealSeed(ROOM, 42, 'finished-state');
    expect(first).toBe(await rematchDealSeed(ROOM, 42, 'finished-state'));
    expect(first).not.toBe(await rematchDealSeed(ROOM, 42, 'different-finish'));
    expect(first).not.toBe(await rematchDealSeed('WXYZ', 42, 'finished-state'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffff_ffff);
  });
});

describe('the round', () => {
  it('resolves once every seat has committed and revealed', async () => {
    const nonces = [createDealNonce(), createDealNonce()];
    const round = await roundOf(nonces);
    expect(round.missing([0, 1])).toEqual([]);
    expect(await round.resolve(ROOM, [0, 1])).toBe(
      await mixDealSeed(ROOM, [
        { seat: 0, nonce: nonces[0]! },
        { seat: 1, nonce: nonces[1]! },
      ]),
    );
  });

  it('names the seats that have not revealed rather than dealing without them', async () => {
    const round = new DealSeedRound();
    const nonce = createDealNonce();
    round.recordCommitment(0, await dealCommitment(ROOM, 0, nonce));
    round.recordContribution(0, nonce);
    expect(round.missing([0, 1, 2])).toEqual([1, 2]);
    await expect(round.resolve(ROOM, [0, 1])).rejects.toThrow(/seat 2 never mixed the shuffle/);
  });

  // The whole point: a seat must not be able to wait, watch, and then pick.
  it('refuses a share that does not match what the seat committed to', async () => {
    const round = new DealSeedRound();
    round.recordCommitment(0, await dealCommitment(ROOM, 0, createDealNonce()));
    round.recordContribution(0, createDealNonce());
    await expect(round.resolve(ROOM, [0])).rejects.toThrow(/had not committed to/);
  });

  it('holds a seat to its first commitment', async () => {
    const round = new DealSeedRound();
    const honest = createDealNonce();
    round.recordCommitment(0, await dealCommitment(ROOM, 0, honest));
    // A second commitment, sent after watching the table, is ignored.
    const swapped = createDealNonce();
    round.recordCommitment(0, await dealCommitment(ROOM, 0, swapped));
    round.recordContribution(0, swapped);
    await expect(round.resolve(ROOM, [0])).rejects.toThrow(/had not committed to/);
  });

  it('holds a seat to its first reveal', async () => {
    const nonce = createDealNonce();
    const round = await roundOf([nonce]);
    round.recordContribution(0, createDealNonce());
    expect(await round.resolve(ROOM, [0])).toBe(await mixDealSeed(ROOM, [{ seat: 0, nonce }]));
  });
});
