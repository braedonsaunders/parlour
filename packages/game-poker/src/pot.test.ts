import { describe, expect, it } from 'vitest';
import type { CardId } from '@parlour/engine';
import { DECK } from './cards';
import { rankHand, type HandRank } from './evaluate';
import { awardPots, awardUncontested, buildPots, potTotal } from './pot';

function hand(...spec: string[]): CardId[] {
  const suits: Record<string, string> = { c: 'C', d: 'D', h: 'H', s: 'S' };
  const ranks: Record<string, number> = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
  return spec.map((text) => {
    const rank = ranks[text[0] as string] ?? Number(text.slice(0, -1));
    const id = `${suits[text[text.length - 1] as string]}${rank}`;
    if (!DECK.faces[id]) throw new Error(`no such card: ${text}`);
    return id;
  });
}

const ranked = (...spec: string[]): HandRank => rankHand(hand(...spec));

describe('building the pots', () => {
  it('makes one pot when everyone put in the same', () => {
    const pots = buildPots([100, 100, 100], [false, false, false]);
    expect(pots).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
  });

  it('keeps a folded seat out of a pot it helped build', () => {
    // Seat 1 folded after putting in 100. Their chips stay in; their claim does
    // not — and since both layers are contested by the same two seats, the
    // table sees one 700 pot rather than an imaginary side pot.
    const pots = buildPots([300, 100, 300], [false, true, false]);
    expect(potTotal(pots)).toBe(700);
    expect(pots).toEqual([{ amount: 700, eligible: [0, 2] }]);
  });

  it('only calls it a side pot when the claimants actually differ', () => {
    const merged = buildPots([200, 200, 100], [false, false, true]);
    expect(merged).toEqual([{ amount: 500, eligible: [0, 1] }]);

    const split = buildPots([200, 200, 100], [false, false, false]);
    expect(split).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 200, eligible: [0, 1] },
    ]);
  });

  it('caps a short all-in at what it could cover', () => {
    // Seat 0 is all-in for 50; the others contest 200 each.
    const pots = buildPots([50, 200, 200], [false, false, false]);
    expect(pots).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 300, eligible: [1, 2] },
    ]);
    expect(potTotal(pots)).toBe(450);
  });

  it('layers three different all-in sizes', () => {
    const pots = buildPots([100, 300, 600, 600], [false, false, false, false]);
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 1, 2, 3] },
      { amount: 600, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
    expect(potTotal(pots)).toBe(1600);
  });

  it('returns an uncalled bet as a pot only its bettor can win', () => {
    const pots = buildPots([500, 200], [false, false]);
    expect(pots[1]).toEqual({ amount: 300, eligible: [0] });
  });

  it('conserves every chip put in, across a hundred random spreads', () => {
    let state = 0x1234_5678;
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let trial = 0; trial < 100; trial++) {
      const seats = 2 + Math.floor(next() * 5);
      const contributions = Array.from({ length: seats }, () => Math.floor(next() * 500));
      const folded = Array.from({ length: seats }, () => next() < 0.4);
      expect(potTotal(buildPots(contributions, folded))).toBe(
        contributions.reduce((sum, amount) => sum + amount, 0),
      );
    }
  });

  it('has nothing to build before a chip is wagered', () => {
    expect(buildPots([0, 0], [false, false])).toEqual([]);
  });
});

describe('awarding the pots', () => {
  it('gives the whole pot to the best hand', () => {
    const pots = buildPots([100, 100, 100], [false, false, false]);
    const { payouts } = awardPots(
      pots,
      [ranked('Ac', 'Ad', 'Kh', 'Qs', 'Jc'), ranked('2c', '2d', '7h', '9s', '4c'), null],
      0,
      3,
    );
    expect(payouts).toEqual([300, 0, 0]);
  });

  it('splits an even pot between tied hands', () => {
    const pots = buildPots([100, 100], [false, false]);
    const { payouts } = awardPots(
      pots,
      [ranked('Ac', 'Ad', 'Kh', 'Qs', 'Jc'), ranked('As', 'Ah', 'Kh', 'Qs', 'Jc')],
      0,
      2,
    );
    expect(payouts).toEqual([100, 100]);
  });

  it('gives the odd chip to the first seat left of the button', () => {
    // 153 in the middle, two hands tied for it — 76 each and one chip over.
    const pots = buildPots([51, 51, 51], [false, false, false]);
    expect(potTotal(pots)).toBe(153);
    const tie = ranked('Ac', 'Ad', 'Kh', 'Qs', 'Jc');
    const alsoTie = ranked('As', 'Ah', 'Kh', 'Qs', 'Jc');
    const loser = ranked('2c', '2d', '7h', '9s', '4c');

    const fromSeatZero = awardPots(pots, [tie, alsoTie, loser], 0, 3);
    expect(fromSeatZero.payouts).toEqual([76, 77, 0]);

    const fromSeatOne = awardPots(pots, [tie, alsoTie, loser], 1, 3);
    expect(fromSeatOne.payouts).toEqual([77, 76, 0]);
  });

  it('returns an uncalled bet rather than splitting it', () => {
    // Seat 0 bet 51 into a seat that could only cover 50. The last chip was
    // never contested, so it comes back rather than joining the split.
    const pots = buildPots([51, 50], [false, false]);
    const tie = ranked('Ac', 'Ad', 'Kh', 'Qs', 'Jc');
    const alsoTie = ranked('As', 'Ah', 'Kh', 'Qs', 'Jc');
    const { payouts } = awardPots(pots, [tie, alsoTie], 0, 2);
    expect(payouts).toEqual([51, 50]);
  });

  it('lets a short all-in win the main pot while the side pot goes elsewhere', () => {
    // Seat 0 is all-in for 50 with the best hand; seats 1 and 2 play on for 200.
    const pots = buildPots([50, 200, 200], [false, false, false]);
    const { payouts } = awardPots(
      pots,
      [
        ranked('Ac', 'Ad', 'Ah', 'Qs', 'Jc'),
        ranked('Kc', 'Kd', '7h', '9s', '4c'),
        ranked('2c', '2d', '7h', '9s', '4c'),
      ],
      0,
      3,
    );
    expect(payouts).toEqual([150, 300, 0]);
    expect(payouts.reduce((sum, amount) => sum + amount, 0)).toBe(potTotal(pots));
  });

  it('pays every chip out, whatever the shape', () => {
    const pots = buildPots([100, 300, 600, 600], [false, false, false, false]);
    const { payouts } = awardPots(
      pots,
      [
        ranked('2c', '2d', '7h', '9s', '4c'),
        ranked('Ac', 'Ad', 'Ah', 'Qs', 'Jc'),
        ranked('Kc', 'Kd', 'Kh', '9s', '4c'),
        ranked('3c', '3d', '7h', '9s', '5c'),
      ],
      0,
      4,
    );
    expect(payouts.reduce((sum, amount) => sum + amount, 0)).toBe(potTotal(pots));
    expect(payouts[1]).toBe(1000);
  });

  it('leaves a pot alone when nobody eligible has a hand', () => {
    const pots = buildPots([100, 100], [true, true]);
    const { payouts, awards } = awardPots(pots, [null, null], 0, 2);
    expect(payouts).toEqual([0, 0]);
    expect(awards).toEqual([]);
  });
});

describe('a walk', () => {
  it('hands everything to the last seat standing without a showdown', () => {
    const pots = buildPots([300, 100, 0], [false, true, true]);
    const { payouts, awards } = awardUncontested(pots, 0, 3);
    expect(payouts).toEqual([400, 0, 0]);
    expect(awards).toEqual([{ seat: 0, amount: 400, potIndex: 0, oddChip: false }]);
  });
});
