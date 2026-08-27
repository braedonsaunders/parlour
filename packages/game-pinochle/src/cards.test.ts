import { describe, expect, it } from 'vitest';
import { openTrick, playToTrick, resolveTrickWinner } from '@parlour/tricks';
import {
  pinochleDeck,
  pinochleTrickRules,
  pointsOf,
  rankOfCard,
  suitOfCard,
  trickRankOf,
} from './cards';

describe('pinochleDeck', () => {
  it('has 48 unique card ids: two copies of A/10/K/Q/J/9 in each suit', () => {
    const deck = pinochleDeck();
    expect(deck.cardIds).toHaveLength(48);
    expect(new Set(deck.cardIds).size).toBe(48);
    for (const suit of ['S', 'H', 'D', 'C']) {
      for (const rank of ['9', 'J', 'Q', 'K', '10', 'A']) {
        const copies = deck.cardIds.filter(
          (id) => suitOfCard(id) === suit && rankOfCard(id) === rank,
        );
        expect(copies).toHaveLength(2);
      }
    }
  });

  it('every id resolves a face with a matching suit and rank', () => {
    const deck = pinochleDeck();
    for (const id of deck.cardIds) {
      const face = deck.faces[id];
      expect(face).toBeDefined();
      expect(face?.suit).toBe(suitOfCard(id));
    }
  });
});

describe('trick rank order', () => {
  it('is A > 10 > K > Q > J > 9', () => {
    expect(trickRankOf('SA-0')).toBeGreaterThan(trickRankOf('S10-0'));
    expect(trickRankOf('S10-0')).toBeGreaterThan(trickRankOf('SK-0'));
    expect(trickRankOf('SK-0')).toBeGreaterThan(trickRankOf('SQ-0'));
    expect(trickRankOf('SQ-0')).toBeGreaterThan(trickRankOf('SJ-0'));
    expect(trickRankOf('SJ-0')).toBeGreaterThan(trickRankOf('S9-0'));
  });

  it('a ten beats a king of the same suit', () => {
    const trick = playToTrick(
      playToTrick(openTrick(0), 0, 'SK-0', pinochleTrickRules('S')),
      1,
      'S10-0',
      pinochleTrickRules('S'),
    );
    expect(resolveTrickWinner(trick, pinochleTrickRules('S'))).toBe(1);
  });
});

describe('equal rank of the same suit', () => {
  it('the first card played of a tied rank keeps the trick', () => {
    let trick = openTrick(0);
    const rules = pinochleTrickRules('S');
    trick = playToTrick(trick, 0, 'SA-0', rules);
    trick = playToTrick(trick, 1, 'SA-1', rules);
    trick = playToTrick(trick, 2, 'S9-0', rules);
    trick = playToTrick(trick, 3, 'S9-1', rules);
    expect(resolveTrickWinner(trick, rules)).toBe(0);
  });

  it('a second-copy trump still beats a non-trump lead of the same rank', () => {
    const rules = pinochleTrickRules('H');
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'SA-0', rules);
    trick = playToTrick(trick, 1, 'HA-0', rules);
    expect(resolveTrickWinner(trick, rules)).toBe(1);
  });
});

describe('pointsOf', () => {
  it('aces, tens and kings are worth 10; queens, jacks and nines are worth 0', () => {
    expect(pointsOf('SA-0')).toBe(10);
    expect(pointsOf('S10-0')).toBe(10);
    expect(pointsOf('SK-0')).toBe(10);
    expect(pointsOf('SQ-0')).toBe(0);
    expect(pointsOf('SJ-0')).toBe(0);
    expect(pointsOf('S9-0')).toBe(0);
  });

  it('the full deck totals 240 trick points before the last-trick bonus', () => {
    const deck = pinochleDeck();
    const total = deck.cardIds.reduce((sum, id) => sum + pointsOf(id), 0);
    expect(total).toBe(240);
  });
});
