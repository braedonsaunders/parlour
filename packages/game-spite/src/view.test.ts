import { describe, expect, it } from 'vitest';
import { spiteGame } from './game';
import { card, fixture, joker, king } from './test-util';

describe('playerView masking', () => {
  it('masks other hands, buried payoff cards and the stock — nothing else', () => {
    const session = fixture({
      seats: 3,
      hands: [[card(2), card(3)], [card(4, 'blue'), king(1)], [joker(0)]],
      payoffs: [[card(9), card(10), card(11)], [card(12), card(5)], []],
      discards: [
        [[card(6), card(7)], [], [], []],
        [[card(8, 'green')], [card(9, 'yellow')], [], []],
        [[], [], [], []],
      ],
      centre: [
        { cards: [card(1), card(2, 'blue')], nextRank: 3 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
      ],
      wildRanks: { [card(2, 'blue')]: 2 },
      stock: [card(13, 'green'), card(1, 'yellow')],
      started: true,
    });

    const view = spiteGame.playerView(session.state, 1);

    // Other hands are opaque; own hand is intact.
    expect(view.hands[0]).toEqual(['??', '??']);
    expect(view.hands[1]).toEqual(session.state.hands[1]);
    expect(view.hands[2]).toEqual(['??']);

    // Buried payoff cards are opaque to everyone — even their owner.
    expect(view.payoffs[0]).toEqual([card(9), '??', '??']);
    expect(view.payoffs[1]).toEqual([card(12), '??']);
    expect(view.payoffs[2]).toEqual([]);

    // The stock is a count, not a list.
    expect(view.stock).toEqual(['??', '??']);

    // Discards and the centre are fully public.
    expect(view.discards).toEqual(session.state.discards);
    expect(view.centre).toEqual(session.state.centre);
    expect(view.wildRanks).toEqual({ [card(2, 'blue')]: 2 });
  });

  it('keeps zone lengths stable so counts stay visible', () => {
    const session = fixture({
      payoffs: [[card(3), card(4), card(5), card(6)], []],
      stock: [card(7), card(8), card(9)],
    });
    const view = spiteGame.playerView(session.state, 0);
    expect(view.payoffs[0]).toHaveLength(4);
    expect(view.stock).toHaveLength(3);
    expect(view.payoffs[0]?.slice(1)).toEqual(['??', '??', '??']);
  });

  it('never leaks a hidden card through legal-move enumeration', () => {
    // Seat 1's view must not offer plays with seat 0's hidden cards in them.
    const session = fixture({
      hands: [[card(2)], [card(3, 'blue')]],
      payoffs: [[], [card(1)]],
      stock: [king(), joker(1)],
      turn: 1,
      started: true,
    });
    const view = spiteGame.playerView(session.state, 1);
    const moves = spiteGame.flow.legalMoves(view, session.phase);
    for (const move of moves) {
      const payload = JSON.stringify(move.payload ?? {});
      expect(payload).not.toContain('red-K-0');
      expect(payload).not.toContain('joker-1');
    }
  });
});
