import { describe, expect, it } from 'vitest';
import { canPlayOnHole, colorOfCard, rankOfCard, suitOfCard } from './cards';

describe('Golf card rules', () => {
  it('reads standard-deck faces without locale or display parsing', () => {
    expect(suitOfCard('S1')).toBe('spades');
    expect(rankOfCard('S1')).toBe(1);
    expect(rankOfCard('H13')).toBe(13);
    expect(colorOfCard('D9')).toBe('red');
    expect(colorOfCard('C9')).toBe('black');
  });

  it('plays one rank away regardless of suit, and never the same rank', () => {
    expect(canPlayOnHole('S7', 'H8', false)).toBe(true);
    expect(canPlayOnHole('D9', 'H8', false)).toBe(true);
    expect(canPlayOnHole('C8', 'H8', false)).toBe(false);
    expect(canPlayOnHole('S10', 'H8', false)).toBe(false);
  });

  it('treats Ace and King as dead ends unless wrap is on', () => {
    expect(canPlayOnHole('S1', 'H13', false)).toBe(false);
    expect(canPlayOnHole('S13', 'H1', false)).toBe(false);
    expect(canPlayOnHole('S1', 'H13', true)).toBe(true);
    expect(canPlayOnHole('S13', 'H1', true)).toBe(true);
    expect(canPlayOnHole('S1', 'H2', false)).toBe(true);
    expect(canPlayOnHole('S12', 'H13', false)).toBe(true);
  });
});
