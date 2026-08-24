import { describe, expect, it } from 'vitest';
import {
  isJester,
  isSpecial,
  isWizard,
  ohhellDeck,
  ohhellTrickRules,
  orderOhHellHand,
  suitOfCard,
} from './cards';

describe('the deck', () => {
  it('is the standard 52 without wizards and 60 with them', () => {
    const plain = ohhellDeck(false);
    const wizard = ohhellDeck(true);
    expect(plain.cardIds).toHaveLength(52);
    expect(wizard.cardIds).toHaveLength(60);
    expect(new Set(wizard.cardIds).size).toBe(60);
    expect(wizard.cardIds.filter(isWizard)).toHaveLength(4);
    expect(wizard.cardIds.filter(isJester)).toHaveLength(4);
    expect(wizard.cardIds.filter((card) => !isSpecial(card))).toHaveLength(52);
  });

  it('gives specials no suit at all — the effectiveSuit remap', () => {
    expect(suitOfCard('W1')).toBeNull();
    expect(suitOfCard('J3')).toBeNull();
    expect(suitOfCard('S1')).toBe('spades');
    const rules = ohhellTrickRules(null);
    expect(rules.effectiveSuit?.('W1')).toBeNull();
    expect(rules.effectiveSuit?.('H5')).toBe('hearts');
    expect(rules.suitOf('W1')).toBeNull();
  });
});

describe('orderOhHellHand', () => {
  it('returns every card exactly once and never mutates the input', () => {
    const cards = ['W2', 'C3', 'J1', 'S1', 'H13', 'D7'];
    const snapshot = [...cards];
    const ordered = orderOhHellHand(cards, { trumpSuit: 'spades' });
    expect([...ordered].sort()).toEqual([...snapshot].sort());
    expect(cards).toEqual(snapshot);
  });

  it('orders jesters first, trump last of the suits, wizards on top', () => {
    const ordered = orderOhHellHand(['S3', 'W1', 'C2', 'J4', 'S12'], { trumpSuit: 'spades' });
    expect(ordered[0]).toBe('J4');
    expect(ordered[ordered.length - 1]).toBe('W1');
    const spades = ordered.filter((card) => suitOfCard(card) === 'spades');
    expect(spades).toEqual(['S12', 'S3']);
  });

  it('falls back to rotation order when no trump is in context', () => {
    const ordered = orderOhHellHand(['S3', 'H2', 'C13', 'D5'], {});
    expect(ordered).toEqual(['C13', 'D5', 'H2', 'S3']);
  });
});
