import { describe, expect, it } from 'vitest';
import { EMPTY_MELD, type MeldBreakdown } from './meld';
import { matchOver, matchResult, scoreHand } from './score';

function meld(total: number): MeldBreakdown {
  return { ...EMPTY_MELD, run: total, total };
}

const NO_MELD: readonly [MeldBreakdown, MeldBreakdown, MeldBreakdown, MeldBreakdown] = [
  EMPTY_MELD,
  EMPTY_MELD,
  EMPTY_MELD,
  EMPTY_MELD,
];

describe('scoreHand', () => {
  it('A: the bidding team makes its bid — meld and trick points both bank', () => {
    const result = scoreHand({
      handNo: 1,
      dealer: 0,
      bidWinner: 0,
      bid: 25,
      trump: 'S',
      meldBySeat: [meld(15), EMPTY_MELD, meld(5), EMPTY_MELD],
      tricksBySeat: [3, 2, 3, 4],
      trickPointsBySeat: [10, 20, 5, 40],
      priorScores: [0, 0],
      rules: { opponentsScoreMeld: true },
    });
    // bid team (seats 0,2): meld 15+5=20, trick points 10+5=15, raw 35 >= bid 25
    expect(result.summary.teams[0].made).toBe(true);
    expect(result.summary.teams[0].delta).toBe(35);
    expect(result.scores[0]).toBe(35);
    // opponents (seats 1,3): trick points 20+40=60, meld 0
    expect(result.summary.teams[1].delta).toBe(60);
    expect(result.summary.set).toBe(false);
  });

  it('B: the bidding team is set — they lose exactly the bid, meld included', () => {
    const result = scoreHand({
      handNo: 1,
      dealer: 0,
      bidWinner: 1,
      bid: 30,
      trump: 'H',
      meldBySeat: [EMPTY_MELD, meld(10), EMPTY_MELD, meld(4)],
      tricksBySeat: [4, 2, 4, 2],
      trickPointsBySeat: [50, 5, 50, 5],
      priorScores: [0, 0],
      rules: { opponentsScoreMeld: true },
    });
    // bid team (seats 1,3): meld 14, trick points 10, raw 24 < bid 30 — set
    expect(result.summary.teams[1].made).toBe(false);
    expect(result.summary.teams[1].delta).toBe(-30);
    expect(result.scores[1]).toBe(-30);
    expect(result.summary.set).toBe(true);
  });

  it('C: opponentsScoreMeld off — the non-bidding team only banks trick points', () => {
    const result = scoreHand({
      handNo: 1,
      dealer: 0,
      bidWinner: 0,
      bid: 25,
      trump: 'S',
      meldBySeat: [meld(25), EMPTY_MELD, EMPTY_MELD, meld(20)],
      tricksBySeat: [6, 2, 3, 1],
      trickPointsBySeat: [100, 20, 30, 10],
      priorScores: [0, 0],
      rules: { opponentsScoreMeld: false },
    });
    // opponents (seats 1,3) score only trick points: 20+10=30, meld 20 dropped
    expect(result.summary.teams[1].delta).toBe(30);
    expect(result.summary.teams[1].meld).toBe(0);
  });

  it('D: meld does not save a set bidding team even when raw would exceed target', () => {
    const result = scoreHand({
      handNo: 1,
      dealer: 0,
      bidWinner: 0,
      bid: 60,
      trump: 'S',
      meldBySeat: NO_MELD,
      tricksBySeat: [1, 5, 1, 5],
      trickPointsBySeat: [5, 100, 5, 100],
      priorScores: [140, 0],
      rules: { opponentsScoreMeld: true },
    });
    expect(result.summary.set).toBe(true);
    expect(result.scores[0]).toBe(80); // 140 - 60
  });
});

describe('matchOver', () => {
  it('is null until a team reaches target', () => {
    expect(matchOver([90, 80], 150, 0, false)).toBeNull();
  });

  it('declares the unique team that crossed target', () => {
    expect(matchOver([160, 80], 150, 0, false)).toEqual({ winner: 0 });
    expect(matchOver([80, 160], 150, 1, false)).toEqual({ winner: 1 });
  });

  it('when both cross the same hand, the bidding team wins if not set', () => {
    expect(matchOver([160, 170], 150, 0, false)).toEqual({ winner: 0 });
  });

  it('when both cross and the bidder was set, the higher score wins', () => {
    expect(matchOver([200, 170], 150, 1, true)).toEqual({ winner: 0 });
  });

  it('when both cross, the bidder was set, and scores tie, the bidder wins', () => {
    expect(matchOver([170, 170], 150, 1, true)).toEqual({ winner: 1 });
  });
});

describe('matchResult', () => {
  it('ranks the winning team 1 and the losing team 2', () => {
    const result = matchResult([160, 80], 150, 0, false);
    expect(result?.winner).toBe(0);
    expect(
      result?.rankings
        .filter((r) => r.rank === 1)
        .map((r) => r.seat)
        .sort(),
    ).toEqual([0, 2]);
    expect(
      result?.rankings
        .filter((r) => r.rank === 2)
        .map((r) => r.seat)
        .sort(),
    ).toEqual([1, 3]);
  });

  it('returns null when the match is not over', () => {
    expect(matchResult([90, 80], 150, 0, false)).toBeNull();
  });
});
