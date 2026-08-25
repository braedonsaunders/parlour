import { describe, expect, it } from 'vitest';
import {
  canPlaceOnTableau,
  colorOfCard,
  deckFor,
  isPackedRun,
  nameOfCard,
  rankOfCard,
  suitOfCard,
} from './cards';

describe('Spider decks', () => {
  it('builds 104 unique ids for each suit-count and keeps PlayingCard.parseCard working', () => {
    const one = deckFor(1);
    const two = deckFor(2);
    const four = deckFor(4);
    expect(one.cardIds).toHaveLength(104);
    expect(two.cardIds).toHaveLength(104);
    expect(four.cardIds).toHaveLength(104);
    expect(new Set(one.cardIds).size).toBe(104);
    expect(new Set(two.cardIds).size).toBe(104);
    expect(new Set(four.cardIds).size).toBe(104);
    expect(one.id).toBe('spider-1suit');
    expect(two.id).toBe('spider-2suit');
    expect(four.id).toBe('spider-4suit');

    expect(one.cardIds.filter((id) => id.startsWith('S'))).toHaveLength(104);
    expect(two.cardIds.some((id) => id.startsWith('D') || id.startsWith('C'))).toBe(false);
    expect(four.cardIds).toContain('C13b');
    expect(one.cardIds).toContain('S1h');
    expect(two.cardIds).toContain('H1d');

    expect(Number.parseInt('13b', 10)).toBe(13);
    expect(Number.parseInt('1b', 10)).toBe(1);
    expect(Number.parseInt('1h', 10)).toBe(1);
    expect(rankOfCard('S13b')).toBe(13);
    expect(rankOfCard('S1h')).toBe(1);
    expect(suitOfCard('S1h')).toBe('spades');
    expect(colorOfCard('S1h')).toBe('black');
    expect(suitOfCard('H7c')).toBe('hearts');
    expect(colorOfCard('H7c')).toBe('red');
  });
});

describe('Spider card rules', () => {
  it('reads faces without locale or display parsing', () => {
    expect(suitOfCard('S1')).toBe('spades');
    expect(rankOfCard('S1')).toBe(1);
    expect(rankOfCard('H13')).toBe(13);
    expect(colorOfCard('D9')).toBe('red');
    expect(colorOfCard('C9')).toBe('black');
    expect(nameOfCard('S13b')).toBe('King of spades');
    expect(nameOfCard('H1')).toBe('Ace of hearts');
  });

  it('builds tableau down by rank and moves only same-suit packed runs', () => {
    expect(canPlaceOnTableau('S12', 'H13')).toBe(true);
    expect(canPlaceOnTableau('H12', 'D13')).toBe(true);
    expect(canPlaceOnTableau('H11', 'C13')).toBe(false);
    expect(canPlaceOnTableau('C5', null)).toBe(true);
    expect(isPackedRun(['S13', 'S12', 'S11'])).toBe(true);
    expect(isPackedRun(['S13', 'H12'])).toBe(false);
    expect(isPackedRun(['S13', 'S11'])).toBe(false);
  });
});
