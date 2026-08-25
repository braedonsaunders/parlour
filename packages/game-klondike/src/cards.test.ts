import { describe, expect, it } from 'vitest';
import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  colorOfCard,
  isPackedRun,
  nameOfCard,
  rankOfCard,
  suitOfCard,
} from './cards';

describe('Klondike card rules', () => {
  it('reads standard-deck faces without locale or display parsing', () => {
    expect(suitOfCard('S1')).toBe('spades');
    expect(rankOfCard('S1')).toBe(1);
    expect(rankOfCard('H13')).toBe(13);
    expect(colorOfCard('D9')).toBe('red');
    expect(colorOfCard('C9')).toBe('black');
    expect(nameOfCard('D13')).toBe('King of diamonds');
    expect(nameOfCard('S1')).toBe('Ace of spades');
    expect(nameOfCard('C10')).toBe('10 of clubs');
  });

  it('builds tableau down in alternating colors and admits only Kings to empties', () => {
    expect(canPlaceOnTableau('S12', 'H13')).toBe(true);
    expect(canPlaceOnTableau('H12', 'D13')).toBe(false);
    expect(canPlaceOnTableau('H11', 'C13')).toBe(false);
    expect(canPlaceOnTableau('C13', null)).toBe(true);
    expect(canPlaceOnTableau('C12', null)).toBe(false);
    expect(isPackedRun(['C13', 'H12', 'S11', 'D10'])).toBe(true);
    expect(isPackedRun(['C13', 'S12'])).toBe(false);
  });

  it('builds each foundation Ace through King in one suit', () => {
    expect(canPlaceOnFoundation('H1', [])).toBe(true);
    expect(canPlaceOnFoundation('H2', ['H1'])).toBe(true);
    expect(canPlaceOnFoundation('D2', ['H1'])).toBe(false);
    expect(canPlaceOnFoundation('H3', ['H1'])).toBe(false);
  });
});
