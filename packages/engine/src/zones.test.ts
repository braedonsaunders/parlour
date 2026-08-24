import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';
import { stdDeck } from './types';
import {
  addTo,
  addToBottom,
  drawFrom,
  keepHandOrder,
  orderedHand,
  peekTop,
  removeFrom,
  shuffledIds,
  stableCardOrder,
} from './zones';

describe('zones', () => {
  const zone = Object.freeze(['S1', 'H2', 'D3', 'C4']);

  it('draws from the top without mutating the source', () => {
    const { drawn, rest } = drawFrom(zone, 2);
    expect(drawn).toEqual(['S1', 'H2']);
    expect(rest).toEqual(['D3', 'C4']);
    expect(zone).toEqual(['S1', 'H2', 'D3', 'C4']);
  });

  it('clamps over-draws and non-positive draws', () => {
    expect(drawFrom(zone, 99)).toEqual({ drawn: [...zone], rest: [] });
    expect(drawFrom(zone, 0)).toEqual({ drawn: [], rest: [...zone] });
    expect(drawFrom(zone, -1)).toEqual({ drawn: [], rest: [...zone] });
  });

  it('peeks the top card and null when empty', () => {
    expect(peekTop(zone)).toBe('S1');
    expect(peekTop([])).toBeNull();
  });

  it('adds to top and bottom', () => {
    expect(addTo(zone, 'S13')).toEqual(['S13', 'S1', 'H2', 'D3', 'C4']);
    expect(addToBottom(zone, 'S13')).toEqual(['S1', 'H2', 'D3', 'C4', 'S13']);
    expect(zone).toHaveLength(4);
  });

  it('removes a card by id and no-ops on misses', () => {
    expect(removeFrom(zone, 'D3')).toEqual(['S1', 'H2', 'C4']);
    const miss = removeFrom(zone, 'ZZ');
    expect(miss).toEqual([...zone]);
    expect(miss).not.toBe(zone);
  });

  it('shuffles a deck deterministically into a new array', () => {
    const deck = stdDeck();
    const a = shuffledIds(deck, makeRng(2024));
    const b = shuffledIds(deck, makeRng(2024));
    expect(a).toEqual(b);
    expect(a).not.toEqual([...deck.cardIds]);
    expect([...a].sort()).toEqual([...deck.cardIds].sort());
  });

  it('orders a copied hand stably without touching the authoritative zone', () => {
    const hand = Object.freeze(['H7', 'S2', 'D7', 'C3']);
    const ordered = stableCardOrder(hand, (left, right) => {
      const rank = (card: string) => Number(card.slice(1));
      return rank(left) - rank(right);
    });

    expect(ordered).toEqual(['S2', 'C3', 'H7', 'D7']);
    expect(hand).toEqual(['H7', 'S2', 'D7', 'C3']);
    expect(ordered).not.toBe(hand);
  });

  it('validates game-pack hand orders as complete permutations', () => {
    expect(orderedHand(zone, keepHandOrder)).toEqual(zone);
    expect(() => orderedHand(zone, (cards) => cards.slice(1))).toThrow(/every card exactly once/);
    expect(() => orderedHand(zone, (cards) => [...cards, cards[0]!])).toThrow(
      /every card exactly once/,
    );
  });
});
