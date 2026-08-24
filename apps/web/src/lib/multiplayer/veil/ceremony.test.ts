import { describe, expect, it, vi } from 'vitest';

// A real 52-card ceremony is thousands of 2048-bit modular exponentiations.
// That is the honest cost of Veil, so these tests get room to pay it rather
// than pretending the shuffle is free.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import {
  acceptLayer,
  baseDeck,
  checkLayer,
  commitLayer,
  finishOpen,
  handleForPosition,
  layShuffleLayer,
  openEpoch,
  positionForHandle,
  roundIdFor,
  shareFor,
  type VeilEpoch,
  type VeilLayerSecret,
} from './ceremony';
import { randomBytes } from './bytes';
import { decodeCard, elementFromHex } from './sra';

const CARDS = ['S1', 'S2', 'S3', 'H1', 'H2', 'H3', 'D1', 'D2'];

/** Runs the whole ceremony locally, standing in for every seat. */
async function ceremony(seats = 3, cards: readonly string[] = CARDS) {
  let epoch = await openEpoch(0, roundIdFor('ABCD', 7, 0), cards, 0);
  const secrets: VeilLayerSecret[] = [];
  let input = baseDeck(epoch);
  for (let seat = 0; seat < seats; seat++) {
    const { entry, secret } = await layShuffleLayer(epoch, seat, input, randomBytes);
    expect(checkLayer(epoch, entry, input, seat)).toBeNull();
    epoch = acceptLayer(epoch, entry, seats);
    secrets.push(secret);
    input = [...entry.deck];
  }
  return { epoch, secrets, seats };
}

/** Every seat's share for one position, recipient last. */
function openPosition(
  epoch: VeilEpoch,
  secrets: readonly VeilLayerSecret[],
  position: number,
  recipient: number,
) {
  const order = [...secrets.keys()].filter((seat) => seat !== recipient).concat(recipient);
  let locked = (epoch.deck as readonly string[])[position] as string;
  const shares = order.map((seat) => {
    const share = shareFor(epoch, secrets[seat] as VeilLayerSecret, position, locked, seat);
    locked = share.value;
    return share;
  });
  return shares;
}

describe('the shuffle ceremony', () => {
  it('ends with a deck nobody can read', async () => {
    const { epoch } = await ceremony();
    expect(epoch.deck).toHaveLength(CARDS.length);
    const readable = (epoch.deck as string[]).filter(
      (element) => decodeCard(epoch.codebook, elementFromHex(element)) !== null,
    );
    expect(readable).toEqual([]);
  });

  it('stays open until the last seat has laid a layer', async () => {
    let epoch = await openEpoch(0, roundIdFor('ABCD', 7, 0), CARDS, 0);
    const { entry } = await layShuffleLayer(epoch, 0, baseDeck(epoch), randomBytes);
    epoch = acceptLayer(epoch, entry, 3);
    expect(epoch.deck).toBeNull();
    expect(epoch.layers).toHaveLength(1);
  });

  it('commits to each layer without revealing the key or the permutation', async () => {
    const { secrets } = await ceremony();
    const secret = secrets[0] as VeilLayerSecret;
    const commitment = await commitLayer(secret);
    expect(commitment).toHaveLength(64);
    expect(commitment).not.toContain(secret.key.e.toString(16).slice(0, 8));
    // The commitment binds the permutation: a different order opens differently.
    const tampered = await commitLayer({ ...secret, order: [...secret.order].reverse() });
    expect(tampered).not.toBe(commitment);
  });

  it('rejects a layer laid out of turn, resized, degenerate or passed through', async () => {
    const epoch = await openEpoch(0, roundIdFor('ABCD', 7, 0), CARDS, 0);
    const input = baseDeck(epoch);
    const { entry } = await layShuffleLayer(epoch, 0, input, randomBytes);

    expect(checkLayer(epoch, entry, input, 1)?.code).toBe('out-of-turn');
    expect(checkLayer(epoch, { ...entry, deck: entry.deck.slice(1) }, input, 0)?.code).toBe(
      'wrong-size',
    );
    expect(checkLayer(epoch, { ...entry, deck: entry.deck.map(() => 'ff') }, input, 0)?.code).toBe(
      'not-a-group-element',
    );
    expect(
      checkLayer(epoch, { ...entry, deck: entry.deck.map(() => entry.deck[0]!) }, input, 0)?.code,
    ).toBe('duplicate-element');
    expect(checkLayer(epoch, { ...entry, deck: input }, input, 0)?.code).toBe('unchanged-deck');
  });
});

describe('private dealing', () => {
  it('gives the recipient the card and nobody else the plaintext', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const shares = openPosition(epoch, secrets, 2, 1);
    const opened = finishOpen(epoch, shares, seats);
    expect('card' in opened).toBe(true);
    expect(CARDS).toContain((opened as { card: string }).card);

    // Every share except the recipient's final one is still unreadable.
    for (const share of shares.slice(0, -1)) {
      expect(decodeCard(epoch.codebook, elementFromHex(share.value))).toBeNull();
    }
  });

  it('deals the whole deck out to distinct cards — the ceremony conserves it', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const dealt = CARDS.map((_, position) => {
      const opened = finishOpen(epoch, openPosition(epoch, secrets, position, 0), seats);
      return (opened as { card: string }).card;
    });
    expect(new Set(dealt)).toEqual(new Set(CARDS));
  });

  it('refuses an opening that is missing a seat', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const shares = openPosition(epoch, secrets, 0, 0);
    const fault = finishOpen(epoch, shares.slice(1), seats);
    expect((fault as { code: string }).code).toBe('missing-shares');
  });

  it('opens the same card when share receipts arrive out of order', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const shares = openPosition(epoch, secrets, 0, 0);
    const ordered = finishOpen(epoch, shares, seats);
    const reordered = finishOpen(epoch, [shares[2]!, shares[0]!, shares[1]!], seats);
    expect(reordered).toEqual(ordered);
  });

  it('rejects duplicate or cross-position shares instead of letting one shadow another', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const shares = openPosition(epoch, secrets, 0, 0);
    expect(finishOpen(epoch, [shares[0]!, shares[0]!, shares[2]!], seats)).toMatchObject({
      code: 'invalid-shares',
    });
    expect(
      finishOpen(epoch, [shares[0]!, { ...shares[1]!, position: 1 }, shares[2]!], seats),
    ).toMatchObject({ code: 'invalid-shares' });
    expect(
      finishOpen(
        epoch,
        shares.map((share) => ({ ...share, position: 1 })),
        seats,
        0,
      ),
    ).toMatchObject({ code: 'invalid-shares' });
  });

  it('catches a dishonest share instead of accepting a made-up card', async () => {
    const { epoch, secrets, seats } = await ceremony();
    const liar = { ...(secrets[0] as VeilLayerSecret), key: (secrets[1] as VeilLayerSecret).key };
    let locked = (epoch.deck as string[])[0] as string;
    const shares = [0, 1, 2].map((seat) => {
      const secret = seat === 0 ? liar : (secrets[seat] as VeilLayerSecret);
      const share = shareFor(epoch, secret, 0, locked, seat);
      locked = share.value;
      return share;
    });
    const fault = finishOpen(epoch, shares, seats);
    expect((fault as { code: string }).code).toBe('not-a-card');
  });

  it('separates epochs, so a recycled pile is genuinely re-shuffled', async () => {
    const first = await ceremony(2, CARDS);
    const second = await openEpoch(1, roundIdFor('ABCD', 7, 1), CARDS, CARDS.length);
    expect(baseDeck(second)).not.toEqual(baseDeck(first.epoch));
    expect(handleForPosition(second, 0)).toBe('v#8');
    expect(positionForHandle(second, 'v#9')).toBe(1);
    expect(positionForHandle(second, 'v#0')).toBeNull();
    expect(positionForHandle(first.epoch, 'v#0')).toBe(0);
  });
});

describe('handles', () => {
  it('maps deck positions to engine handles and back', async () => {
    const epoch = await openEpoch(0, roundIdFor('ABCD', 7, 0), CARDS, 0);
    expect(handleForPosition(epoch, 5)).toBe('v#5');
    expect(positionForHandle(epoch, 'v#5')).toBe(5);
    expect(positionForHandle(epoch, 'S1')).toBeNull();
    expect(positionForHandle(epoch, 'v#999')).toBeNull();
  });
});
