import { describe, expect, it } from 'vitest';
import { computeMeld } from './meld';

describe('computeMeld', () => {
  it('scores a trump run A-10-K-Q-J as 15', () => {
    const hand = ['SA-0', 'S10-0', 'SK-0', 'SQ-0', 'SJ-0', 'H9-0', 'H9-1', 'C9-0'];
    const meld = computeMeld(hand, 'S');
    expect(meld.run).toBe(15);
    expect(meld.extraMarriage).toBe(0);
    expect(meld.royalMarriage).toBe(0);
  });

  it('scores an extra trump marriage beyond the run as 2', () => {
    const hand = [
      'SA-0',
      'S10-0',
      'SK-0',
      'SQ-0',
      'SJ-0', // the run
      'SK-1',
      'SQ-1', // a second trump K+Q
      'H9-0',
    ];
    const meld = computeMeld(hand, 'S');
    expect(meld.run).toBe(15);
    expect(meld.extraMarriage).toBe(2);
  });

  it('scores a royal marriage (trump K+Q, no run) as 4', () => {
    const hand = ['SK-0', 'SQ-0', 'H9-0'];
    const meld = computeMeld(hand, 'S');
    expect(meld.run).toBe(0);
    expect(meld.royalMarriage).toBe(4);
  });

  it('scores two royal marriages when both trump K and both trump Q are held', () => {
    const hand = ['SK-0', 'SK-1', 'SQ-0', 'SQ-1'];
    const meld = computeMeld(hand, 'S');
    expect(meld.royalMarriage).toBe(8);
  });

  it('scores a common marriage (K+Q, non-trump) as 2', () => {
    const hand = ['HK-0', 'HQ-0'];
    const meld = computeMeld(hand, 'S');
    expect(meld.commonMarriage).toBe(2);
  });

  it('scores pinochle (Q♠ + J♦) as 4', () => {
    const hand = ['SQ-0', 'DJ-0'];
    const meld = computeMeld(hand, 'H');
    expect(meld.pinochle).toBe(4);
  });

  it('scores double pinochle (both Q♠ and both J♦) as 30, not 4+4', () => {
    const hand = ['SQ-0', 'SQ-1', 'DJ-0', 'DJ-1'];
    const meld = computeMeld(hand, 'H');
    expect(meld.pinochle).toBe(30);
  });

  it('scores arounds once per rank held in all four suits', () => {
    const hand = ['SA-0', 'HA-0', 'DA-0', 'CA-0', 'SK-0', 'HK-0', 'DK-0', 'CK-0'];
    const meld = computeMeld(hand, 'S');
    expect(meld.acesAround).toBe(10);
    expect(meld.kingsAround).toBe(8);
    expect(meld.queensAround).toBe(0);
    expect(meld.jacksAround).toBe(0);
  });

  it('scores each 9 of trump as 1 (dix)', () => {
    expect(computeMeld(['S9-0'], 'S').dix).toBe(1);
    expect(computeMeld(['S9-0', 'S9-1'], 'S').dix).toBe(2);
    expect(computeMeld(['H9-0'], 'S').dix).toBe(0);
  });

  it('double-counts a card across run/marriage, arounds, and pinochle', () => {
    // Q♠ counts toward the trump run AND queens-around AND pinochle at once.
    const hand = [
      'SA-0',
      'S10-0',
      'SK-0',
      'SQ-0',
      'SJ-0', // trump run, uses SQ-0
      'HQ-0',
      'DQ-0',
      'CQ-0', // queens around, completed by SQ-0
      'DJ-0', // pinochle, completed by SQ-0
    ];
    const meld = computeMeld(hand, 'S');
    expect(meld.run).toBe(15);
    expect(meld.queensAround).toBe(6);
    expect(meld.pinochle).toBe(4);
    expect(meld.total).toBe(15 + 6 + 4);
  });

  it('totals every category', () => {
    const hand = ['SA-0', 'S10-0', 'SK-0', 'SQ-0', 'SJ-0', 'S9-0'];
    const meld = computeMeld(hand, 'S');
    expect(meld.total).toBe(meld.run + meld.dix);
  });

  it('scores nothing for a bare hand with no melds', () => {
    const meld = computeMeld(['H9-0', 'C9-0'], 'S');
    expect(meld.total).toBe(0);
  });
});
