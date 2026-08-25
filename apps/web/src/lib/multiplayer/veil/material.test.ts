import { beforeEach, describe, expect, it } from 'vitest';
import { generateLayerKey, randomPermutation } from './sra';
import { createIdentity, exportIdentity, restoreIdentity, signValue, verifyValue } from './signing';
import { clearRoundMaterial, layerStream, loadRoundMaterial, saveRoundMaterial } from './material';

const ROOM = 'QRST';
const OWNER = 'profile-a';

describe('derived layer streams', () => {
  it('gives the same bytes to the same seat in the same room and epoch', async () => {
    const seed = 'ab'.repeat(32);
    const first = await layerStream(seed, ROOM, 0);
    const second = await layerStream(seed, ROOM, 0);
    expect([...first(64)]).toEqual([...second(64)]);
  });

  it('separates epochs, rooms and seeds', async () => {
    const seed = 'ab'.repeat(32);
    const base = [...(await layerStream(seed, ROOM, 0))(32)];
    expect([...(await layerStream(seed, ROOM, 1))(32)]).not.toEqual(base);
    expect([...(await layerStream(seed, 'WXYZ', 0))(32)]).not.toEqual(base);
    expect([...(await layerStream('cd'.repeat(32), ROOM, 0))(32)]).not.toEqual(base);
  });

  it('advances, so consecutive draws differ', async () => {
    const stream = await layerStream('ab'.repeat(32), ROOM, 0);
    expect([...stream(32)]).not.toEqual([...stream(32)]);
  });

  // The point of all of it: the layer itself has to come back identical, not
  // just the bytes behind it.
  it('rebuilds a byte-identical layer key and permutation', async () => {
    const seed = 'ef'.repeat(32);
    const laid = await layerStream(seed, ROOM, 2);
    const key = generateLayerKey(laid);
    const order = randomPermutation(52, laid);

    const resumed = await layerStream(seed, ROOM, 2);
    const rebuiltKey = generateLayerKey(resumed);
    const rebuiltOrder = randomPermutation(52, resumed);

    expect(rebuiltKey.e).toBe(key.e);
    expect(rebuiltKey.d).toBe(key.d);
    expect(rebuiltOrder).toEqual(order);
  });

  it('refuses to wrap rather than quietly handing back a different layer', async () => {
    const stream = await layerStream('ab'.repeat(32), ROOM, 0);
    expect(() => stream(8_160 * 8 + 1)).toThrow(/exhausted/);
  });
});

describe('a seat that comes back', () => {
  beforeEach(() => {
    clearRoundMaterial(ROOM, OWNER);
  });

  it('keeps its master seed and its signing key across a reload', async () => {
    const first = await loadRoundMaterial(ROOM, OWNER);
    const second = await loadRoundMaterial(ROOM, OWNER);
    expect(second.masterSeed).toBe(first.masterSeed);
    expect(second.identity.publicKey).toBe(first.identity.publicKey);
  });

  it('signs as the same identity the round header registered', async () => {
    const material = await loadRoundMaterial(ROOM, OWNER);
    const signature = await signValue(material.identity, 'test', { hello: 'table' });

    const restored = await loadRoundMaterial(ROOM, OWNER);
    const afterReload = await signValue(restored.identity, 'test', { hello: 'table' });
    // Both signatures verify under the public key in the header — ECDSA is
    // randomised, so the bytes differ while the signer does not.
    expect(
      await verifyValue(material.identity.publicKey, 'test', { hello: 'table' }, signature),
    ).toBe(true);
    expect(
      await verifyValue(material.identity.publicKey, 'test', { hello: 'table' }, afterReload),
    ).toBe(true);
  });

  it('mints fresh material for a different room', async () => {
    const mine = await loadRoundMaterial(ROOM, OWNER);
    const other = await loadRoundMaterial('ZZZZ', OWNER);
    expect(other.masterSeed).not.toBe(mine.masterSeed);
    clearRoundMaterial('ZZZZ', OWNER);
  });

  it('keeps two profiles in one browser apart', async () => {
    const mine = await loadRoundMaterial(ROOM, OWNER);
    const theirs = await loadRoundMaterial(ROOM, 'profile-b');
    expect(theirs.masterSeed).not.toBe(mine.masterSeed);
    expect(theirs.identity.publicKey).not.toBe(mine.identity.publicKey);
    clearRoundMaterial(ROOM, 'profile-b');
  });

  it('starts over once the room is forgotten', async () => {
    const before = await loadRoundMaterial(ROOM, OWNER);
    clearRoundMaterial(ROOM, OWNER);
    const after = await loadRoundMaterial(ROOM, OWNER);
    expect(after.masterSeed).not.toBe(before.masterSeed);
  });

  it('round-trips an identity through storage', async () => {
    const identity = await createIdentity();
    const restored = await restoreIdentity(await exportIdentity(identity), identity.publicKey);
    const signature = await signValue(restored, 'test', { seat: 1 });
    expect(await verifyValue(identity.publicKey, 'test', { seat: 1 }, signature)).toBe(true);
  });

  it('replaces material it cannot read', async () => {
    const material = await loadRoundMaterial(ROOM, OWNER);
    localStorage.setItem(`parlour.veil.round.${ROOM}:${OWNER}`, '{ not json');
    const replaced = await loadRoundMaterial(ROOM, OWNER);
    expect(replaced.masterSeed).not.toBe(material.masterSeed);
    await saveRoundMaterial(replaced);
  });
});
