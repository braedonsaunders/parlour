import { describe, expect, it, vi } from 'vitest';

// A real 52-card ceremony is thousands of 2048-bit modular exponentiations.
// That is the honest cost of Veil, so these tests get room to pay it rather
// than pretending the shuffle is free.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import {
  applyPermutation,
  buildCodebook,
  decodeCard,
  decryptElement,
  elementFromHex,
  elementToHex,
  encodeCard,
  encryptElement,
  generateLayerKey,
  invertPermutation,
  modInverse,
  modPow,
  randomPermutation,
  shuffleLayer,
  shuffleLayerAsync,
  VEIL_PRIME,
} from './sra';

const CARDS = ['S1', 'S2', 'H3', 'H4', 'D5', 'D6', 'C7', 'C8'];

describe('modular arithmetic', () => {
  it('exponentiates in the group', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(0n, 5n, 7n)).toBe(0n);
    expect(modPow(5n, 0n, 7n)).toBe(1n);
  });

  it('inverts exponents modulo p - 1', () => {
    const key = generateLayerKey();
    expect((key.e * key.d) % (VEIL_PRIME - 1n)).toBe(1n);
  });

  it('refuses to invert a value that shares a factor with the modulus', () => {
    expect(() => modInverse(4n, 8n)).toThrow(/not invertible/);
  });
});

describe('layer keys', () => {
  it('round-trips a group element', () => {
    const key = generateLayerKey();
    const value = 123456789n;
    expect(decryptElement(encryptElement(value, key), key)).toBe(value);
  });

  it('commutes, which is the whole point', () => {
    const a = generateLayerKey();
    const b = generateLayerKey();
    const value = 987654321n;
    expect(encryptElement(encryptElement(value, a), b)).toBe(
      encryptElement(encryptElement(value, b), a),
    );
  });

  it('lets any seat peel its layer in any order', () => {
    const keys = [generateLayerKey(), generateLayerKey(), generateLayerKey()];
    const value = 4242424242n;
    let locked = value;
    for (const key of keys) locked = encryptElement(locked, key);
    // Peel out of order: middle, last, first.
    let open = decryptElement(locked, keys[1]!);
    open = decryptElement(open, keys[2]!);
    open = decryptElement(open, keys[0]!);
    expect(open).toBe(value);
  });

  it('draws distinct keys', () => {
    const keys = Array.from({ length: 8 }, () => generateLayerKey().e);
    expect(new Set(keys.map(String)).size).toBe(8);
  });
});

describe('card encoding', () => {
  it('is deterministic per round and card', async () => {
    expect(await encodeCard('r1', 'S1')).toBe(await encodeCard('r1', 'S1'));
  });

  it('separates rounds, so a card element is never reusable across deals', async () => {
    expect(await encodeCard('r1', 'S1')).not.toBe(await encodeCard('r2', 'S1'));
  });

  it('always lands on a quadratic residue, hiding the Legendre split', async () => {
    for (const card of CARDS) {
      const element = await encodeCard('round', card);
      // Euler's criterion: a residue satisfies m^((p-1)/2) = 1.
      expect(modPow(element, (VEIL_PRIME - 1n) / 2n, VEIL_PRIME)).toBe(1n);
    }
  });

  it('builds a two-way codebook with no collisions', async () => {
    const book = await buildCodebook('round', CARDS);
    for (const card of CARDS) {
      expect(decodeCard(book, book.elementOf.get(card)!)).toBe(card);
    }
    expect(book.cardOf.size).toBe(CARDS.length);
  });

  it('reads a value that is not a card as no card at all', async () => {
    const book = await buildCodebook('round', CARDS);
    expect(decodeCard(book, 9n)).toBeNull();
  });
});

describe('element transport', () => {
  it('round-trips through fixed-width hex', () => {
    const value = 0xdeadbeefn;
    expect(elementFromHex(elementToHex(value))).toBe(value);
    expect(elementToHex(value)).toHaveLength(512);
  });

  it('rejects short, malformed and out-of-group values', () => {
    expect(() => elementFromHex('ff')).toThrow(/group element/);
    expect(() => elementFromHex('z'.repeat(512))).toThrow();
    expect(() => elementFromHex(elementToHex(0n))).toThrow(/outside the group/);
  });
});

describe('permutations', () => {
  it('produces a bijection', () => {
    const order = randomPermutation(52);
    expect(new Set(order).size).toBe(52);
    expect(Math.min(...order)).toBe(0);
    expect(Math.max(...order)).toBe(51);
  });

  it('inverts', () => {
    const order = randomPermutation(12);
    const items = Array.from({ length: 12 }, (_, index) => `c${index}`);
    const shuffled = applyPermutation(items, order);
    expect(applyPermutation(shuffled, invertPermutation(order))).toEqual(items);
  });

  it('rejects a permutation of the wrong size', () => {
    expect(() => applyPermutation([1, 2, 3], [0, 1])).toThrow(/size mismatch/);
  });
});

describe('the shuffle itself', () => {
  it('hides the deck under every layer and gives it back when all come off', async () => {
    const book = await buildCodebook('round', CARDS);
    const keys = [generateLayerKey(), generateLayerKey(), generateLayerKey()];

    let deck = CARDS.map((card) => book.elementOf.get(card)!);
    const orders = keys.map(() => randomPermutation(CARDS.length));
    keys.forEach((key, index) => {
      deck = shuffleLayer(deck, key, orders[index]!);
    });

    // Nothing in the locked deck reads as a card.
    expect(deck.every((element) => decodeCard(book, element) === null)).toBe(true);

    // Every seat peels its own layer; the recipient peels last.
    const opened = deck.map((element) => {
      let value = element;
      for (const key of keys) value = decryptElement(value, key);
      return decodeCard(book, value);
    });
    expect(opened.every((card) => card !== null)).toBe(true);
    expect(new Set(opened)).toEqual(new Set(CARDS));
  });

  it('gives no seat the mapping on its own', async () => {
    const book = await buildCodebook('round', CARDS);
    const mine = generateLayerKey();
    const theirs = generateLayerKey();

    const deck = CARDS.map((card) => book.elementOf.get(card)!);
    const afterMine = shuffleLayer(deck, mine, randomPermutation(CARDS.length));
    const afterTheirs = shuffleLayer(afterMine, theirs, randomPermutation(CARDS.length));

    // The first shuffler removes its own layer and still sees nothing: the
    // second seat's layer is still on, and its permutation is unknown.
    const peeledByMe = afterTheirs.map((element) => decryptElement(element, mine));
    expect(peeledByMe.every((element) => decodeCard(book, element) === null)).toBe(true);
  });

  /**
   * The ceremony yields to the event loop between chunks so a long shuffle
   * cannot starve the heartbeat timer and get a seat declared gone. That is
   * only safe if it shuffles to exactly the same deck.
   */
  it('shuffles identically whether or not it pauses to let timers run', async () => {
    const book = await buildCodebook('round', CARDS);
    const deck = CARDS.map((card) => book.elementOf.get(card)!);
    const key = generateLayerKey();
    const order = randomPermutation(CARDS.length);

    expect(await shuffleLayerAsync(deck, key, order)).toEqual(shuffleLayer(deck, key, order));
  });
});
