import { describe, expect, it } from 'vitest';
import { makeRng } from '@parlour/engine';
import {
  captureValue,
  countKings,
  dealLayout,
  deckForDisplay,
  DECK,
  DECK_ITALIANO,
  isSettebello,
  orderScopaHand,
  ownerOf,
  seatsOfOwner,
  suitOfCard,
  playsInTeams,
} from './cards';

describe('the 40-card Italian deck', () => {
  it('has exactly four suits × ten ranks', () => {
    expect(DECK.cardIds).toHaveLength(40);
    expect(new Set(DECK.cardIds).size).toBe(40);
    for (let rank = 1; rank <= 10; rank++) {
      expect(captureValue(`D${rank}`)).toBe(rank);
      expect(captureValue(`C${rank}`)).toBe(rank);
      expect(captureValue(`S${rank}`)).toBe(rank);
      expect(captureValue(`B${rank}`)).toBe(rank);
    }
  });

  it('keeps ids Italian-semantic while French faces remap display only', () => {
    const french = deckForDisplay(true);
    const italian = DECK_ITALIANO;
    expect(french.cardIds).toEqual(italian.cardIds);
    expect(french.faces['D7']!.label).toBe('7♦');
    expect(french.faces['D8']!.short).toBe('J');
    expect(french.faces['C10']!.label).toBe('K♥');
    expect(suitOfCard('D8')).toBe('denari');
    expect(suitOfCard('S1')).toBe('spade');
    expect(isSettebello('D7')).toBe(true);
    // the semantic suit survives the display toggle
    expect(french.faces['B3']!.suit).toBe('clubs');
    expect(italian.faces['B3']!.suit).toBe('bastoni');
    expect(italian.faces['D10']!.label).toBe('10D');
  });
});

describe('partnership mapping', () => {
  it('pairs alternating seats at four and six, individuals otherwise', () => {
    expect(playsInTeams(4)).toBe(true);
    expect(playsInTeams(6)).toBe(true);
    expect(playsInTeams(2)).toBe(false);
    expect(playsInTeams(3)).toBe(false);

    for (const seats of [4, 6] as const) {
      expect(seatsOfOwner(0, seats)).toEqual(Array.from({ length: seats / 2 }, (_, i) => i * 2));
      expect(ownerOf(3, seats)).toBe(1);
    }
    expect(ownerOf(2, 3)).toBe(2);
    expect(seatsOfOwner(1, 2)).toEqual([1]);
  });
});

describe('dealLayout', () => {
  it('deals three each plus a stock in ordinary Scopa', () => {
    const order = [...DECK.cardIds];
    const layout = dealLayout(order, 4, false);
    expect(layout.table).toHaveLength(4);
    layout.hands.forEach((hand) => expect(hand).toHaveLength(3));
    expect(layout.stock).toHaveLength(24);
    const all = [...layout.table, ...layout.hands.flat(), ...layout.stock];
    expect(all.sort()).toEqual([...DECK.cardIds].sort());
  });

  it('spreads the whole remainder in Scopone with no stock', () => {
    for (const seats of [2, 3, 4, 6] as const) {
      const layout = dealLayout([...DECK.cardIds], seats, true);
      expect(layout.stock).toHaveLength(0);
      expect((36 / seats) % 1).toBe(0);
      layout.hands.forEach((hand) => expect(hand).toHaveLength(36 / seats));
    }
  });

  it('flags king-heavy tableaux for a redeal', () => {
    expect(countKings(['D10', 'C10', 'S5'])).toBe(2);
    expect(countKings(['D10', 'C10', 'S10', 'B7'])).toBe(3);
    const clean = dealLayout([...DECK.cardIds], 2, false);
    expect(countKings(clean.table)).toBeLessThan(3);
  });

  it('never deals a tableau with three or more kings across many seeds', () => {
    for (let seed = 0; seed < 120; seed++) {
      const order = makeRng(seed).shuffle([...DECK.cardIds]);
      for (const seats of [2, 4]) {
        const scopone = dealLayout(order, seats, true);
        expect(countKings(scopone.table)).toBeLessThan(3);
      }
    }
  });
});

describe('orderScopaHand', () => {
  it('returns every card exactly once, grouped denari → coppe → spade → bastoni', () => {
    const hand = ['B10', 'D1', 'C7', 'D7', 'S3', 'B1'];
    const ordered = orderScopaHand(hand, {});
    expect([...ordered].sort()).toEqual([...hand].sort());
    expect(ordered).toEqual(['D1', 'D7', 'C7', 'S3', 'B1', 'B10']);
  });
});
