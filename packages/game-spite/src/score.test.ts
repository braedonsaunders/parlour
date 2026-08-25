import { describe, expect, it } from 'vitest';
import { matchResult, payoffRemaining, progress, rankChasers } from './score';
import { card, fixture } from './test-util';

describe('payoff arithmetic', () => {
  it('counts remaining cards and normalises progress against the configured pile', () => {
    const session = fixture({
      payoffs: [[card(1), card(2), card(3)], []],
    });
    expect(payoffRemaining(session.state, 0)).toBe(3);
    expect(payoffRemaining(session.state, 1)).toBe(0);
    // 30-card default pile: three left is 90% of the way home.
    expect(progress(session.state, 0)).toBeCloseTo(1 - 3 / 30);
    expect(progress(session.state, 1)).toBe(1);
  });

  it('clamps progress into 0..1 even when a pile outgrew its config', () => {
    const odd = fixture(
      { payoffs: [Array.from({ length: 30 }, (_, i) => card((i % 12) + 1)), []] },
      { payoffSize: 5 } as never,
    );
    expect(progress(odd.state, 0)).toBeLessThanOrEqual(1);
    expect(progress(odd.state, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('rankChasers', () => {
  it('orders by fewest payoff cards, then smallest hand, then seat order', () => {
    const session = fixture({
      seats: 4,
      hands: [[], [card(1), card(2)], [], []],
      payoffs: [[card(5)], [], [card(6), card(7), card(8)], [card(9), card(10)]],
    });
    expect(rankChasers(session.state, null)).toEqual([
      { seat: 1, rank: 2, detail: { payoff: 0, hand: 2 } },
      { seat: 0, rank: 3, detail: { payoff: 1, hand: 0 } },
      { seat: 3, rank: 4, detail: { payoff: 2, hand: 0 } },
      { seat: 2, rank: 5, detail: { payoff: 3, hand: 0 } },
    ]);
  });

  it('excludes the winner from the chasing pack', () => {
    const session = fixture({ payoffs: [[], [card(1)]] });
    expect(rankChasers(session.state, 0).map((entry) => entry.seat)).toEqual([1]);
  });

  it('breaks ties on hand size and then seat number so replays are unique', () => {
    const tied = fixture({
      seats: 3,
      hands: [[card(1)], [card(2)], []],
      payoffs: [[card(8)], [card(8), card(9)], [card(7), card(10)]],
    });
    expect(rankChasers(tied.state, null).map((entry) => entry.seat)).toEqual([0, 2, 1]);
  });
});

describe('matchResult', () => {
  it('is null while play continues', () => {
    const session = fixture({});
    expect(matchResult(session.state)).toBeNull();
  });

  it('crowns the payoff winner and ranks everyone else behind them', () => {
    const session = fixture({
      seats: 3,
      hands: [[card(1)], []],
      payoffs: [[], [card(4), card(5)], [card(6)]],
      winner: 0,
    });
    const result = matchResult(session.state);
    expect(result).toMatchObject({ winner: 0, reason: 'payoff-cleared' });
    expect(result?.rankings.map((entry) => entry.seat)).toEqual([0, 2, 1]);
  });

  it('settles a locked table by closest-to-victory', () => {
    const session = fixture({
      seats: 2,
      payoffs: [[card(1), card(2)], [card(3)]],
      stuckRuns: 2,
    });
    const result = matchResult(session.state);
    expect(result).toMatchObject({ winner: 1, reason: 'table-locked' });
    expect(result?.rankings[0]).toMatchObject({ seat: 1, rank: 1 });
    expect(result?.rankings[1]).toMatchObject({ seat: 0, rank: 2 });
  });
});
