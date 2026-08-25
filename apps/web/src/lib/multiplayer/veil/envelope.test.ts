import { describe, expect, it } from 'vitest';
import { parseWire } from '../wireSchema';
import { createIdentity } from './signing';
import { VeilSession } from './session';
import { veilWireFault } from './wire';

const DECK = ['S1', 'S2', 'H3', 'D4'];

async function twoSeatHeader() {
  const keys = await Promise.all([createIdentity(), createIdentity()]);
  const host = new VeilSession({
    roomCode: 'AB2Z',
    seed: 7,
    seat: 0,
    seats: 2,
    gameId: 'blitz',
    config: { threeOfAKind: '30.5', tieLowest: 'both', discardLock: true, outMask: 0 },
  });
  await host.start();
  return host.openRound(
    keys.map((identity) => identity.publicKey),
    DECK,
  );
}

describe('veil envelopes on the room wire', () => {
  it('accepts a header the host actually publishes at start', async () => {
    const header = await twoSeatHeader();
    const wire = JSON.stringify({
      type: 'veil',
      to: null,
      message: { type: 'veil.header', header },
    });
    expect(parseWire(wire)).toEqual({
      type: 'veil',
      to: null,
      message: { type: 'veil.header', header },
    });
  });

  it('names a header whose two seats reused one signing key', async () => {
    const identity = await createIdentity();
    const fault = veilWireFault({
      type: 'veil',
      to: null,
      message: {
        type: 'veil.header',
        header: {
          roundId: 'AB2Z:7:0',
          gameId: 'blitz',
          rulesHash: 'a'.repeat(64),
          seats: 2,
          keys: [identity.publicKey, identity.publicKey],
          deck: DECK,
        },
      },
    });
    expect(fault).toBe('veil.header.duplicate-key');
  });

  it('accepts a hello whose key is a real P-256 SPKI', async () => {
    const identity = await createIdentity();
    const wire = JSON.stringify({
      type: 'veil',
      to: null,
      message: { type: 'veil.hello', seat: 1, publicKey: identity.publicKey },
    });
    expect(parseWire(wire)?.type).toBe('veil');
  });
});
