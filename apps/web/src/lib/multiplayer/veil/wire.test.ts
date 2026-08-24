import { describe, expect, it } from 'vitest';
import { isVeilMessage, parseVeilMessage } from './wire';
import { VEIL_ELEMENT_BYTES } from './sra';

const ELEMENT = 'a'.repeat(VEIL_ELEMENT_BYTES * 2);
const HASH = 'b'.repeat(64);

function layerEntry(overrides: Record<string, unknown> = {}) {
  return { epoch: 0, seat: 0, deck: [ELEMENT], commitment: HASH, ...overrides };
}

function signedEntry(overrides: Record<string, unknown> = {}) {
  return {
    seq: 0,
    kind: 'ceremony.layer',
    seat: 0,
    signer: 'key',
    previous: HASH,
    payload: layerEntry(),
    hash: HASH,
    signature: 'sig',
    ...overrides,
  };
}

const header = {
  roundId: 'ABCD:1:0',
  gameId: 'blitz',
  rulesHash: HASH,
  seats: 2,
  keys: ['k0', 'k1'],
  deck: ['S1', 'S2'],
};

describe('veil wire validation', () => {
  it('accepts every message the protocol actually sends', () => {
    expect(isVeilMessage({ type: 'veil.hello', seat: 0, publicKey: 'k0' })).toBe(true);
    expect(isVeilMessage({ type: 'veil.header', header })).toBe(true);
    expect(isVeilMessage({ type: 'veil.entry', entry: signedEntry() })).toBe(true);
    expect(
      isVeilMessage({ type: 'veil.peel', epoch: 0, position: 3, forSeat: 1, locked: ELEMENT }),
    ).toBe(true);
    expect(
      isVeilMessage({
        type: 'veil.share',
        share: { epoch: 0, position: 3, seat: 1, value: ELEMENT },
        forSeat: 0,
        sequence: 1,
      }),
    ).toBe(true);
    expect(
      isVeilMessage({
        type: 'veil.disclose',
        seat: 0,
        secrets: [{ epoch: 0, e: 'ab', d: 'cd', order: [1, 0], salt: 'ef' }],
      }),
    ).toBe(true);
  });

  it('rejects unknown types and extra keys', () => {
    expect(isVeilMessage({ type: 'veil.nope' })).toBe(false);
    expect(isVeilMessage({ type: 'veil.hello', seat: 0, publicKey: 'k', extra: 1 })).toBe(false);
    expect(isVeilMessage({ type: 'veil.hello', seat: 0 })).toBe(false);
    expect(isVeilMessage(null)).toBe(false);
    expect(isVeilMessage([])).toBe(false);
  });

  it('rejects group elements of the wrong width or alphabet', () => {
    expect(
      isVeilMessage({ type: 'veil.peel', epoch: 0, position: 0, forSeat: 0, locked: 'ab' }),
    ).toBe(false);
    expect(
      isVeilMessage({
        type: 'veil.peel',
        epoch: 0,
        position: 0,
        forSeat: 0,
        locked: 'A'.repeat(VEIL_ELEMENT_BYTES * 2),
      }),
    ).toBe(false);
  });

  it('rejects a header whose key count does not match its seat count', () => {
    expect(isVeilMessage({ type: 'veil.header', header: { ...header, seats: 3 } })).toBe(false);
    expect(isVeilMessage({ type: 'veil.header', header: { ...header, keys: ['k0', 'k0'] } })).toBe(
      false,
    );
    expect(isVeilMessage({ type: 'veil.header', header: { ...header, deck: ['S1', 'S1'] } })).toBe(
      false,
    );
    expect(isVeilMessage({ type: 'veil.header', header: { ...header, seats: 1 } })).toBe(false);
  });

  it('type-checks a ceremony layer payload instead of waving it through', () => {
    expect(isVeilMessage({ type: 'veil.entry', entry: signedEntry({ payload: {} }) })).toBe(false);
    expect(
      isVeilMessage({
        type: 'veil.entry',
        entry: signedEntry({ payload: layerEntry({ deck: ['short'] }) }),
      }),
    ).toBe(false);
    expect(
      isVeilMessage({
        type: 'veil.entry',
        entry: signedEntry({ payload: layerEntry({ commitment: 'nope' }) }),
      }),
    ).toBe(false);
  });

  it('rejects an oversized deck rather than letting a peer set the bound', () => {
    expect(
      isVeilMessage({
        type: 'veil.entry',
        entry: signedEntry({ payload: layerEntry({ deck: Array(300).fill(ELEMENT) }) }),
      }),
    ).toBe(false);
  });

  it('rejects a disclosure whose permutation repeats an index', () => {
    expect(
      isVeilMessage({
        type: 'veil.disclose',
        seat: 0,
        secrets: [{ epoch: 0, e: 'ab', d: 'cd', order: [1, 1], salt: 'ef' }],
      }),
    ).toBe(false);
  });

  it('rejects seats and positions outside the table', () => {
    expect(isVeilMessage({ type: 'veil.hello', seat: 99, publicKey: 'k' })).toBe(false);
    expect(isVeilMessage({ type: 'veil.hello', seat: -1, publicKey: 'k' })).toBe(false);
    expect(isVeilMessage({ type: 'veil.hello', seat: 1.5, publicKey: 'k' })).toBe(false);
    expect(
      isVeilMessage({ type: 'veil.peel', epoch: 0, position: 9999, forSeat: 0, locked: ELEMENT }),
    ).toBe(false);
  });

  it('parses valid json and refuses the rest', () => {
    expect(
      parseVeilMessage(JSON.stringify({ type: 'veil.hello', seat: 0, publicKey: 'k' })),
    ).toEqual({ type: 'veil.hello', seat: 0, publicKey: 'k' });
    expect(parseVeilMessage('{')).toBeNull();
    expect(parseVeilMessage('"just a string"')).toBeNull();
    expect(parseVeilMessage('x'.repeat(2_000_001))).toBeNull();
  });
});
