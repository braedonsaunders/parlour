import { describe, expect, it } from 'vitest';
import { scoreHand, scoreTeam, matchOver, matchResult } from './score';
import type { SpadesBid } from './state';

const on = { nil: true, bags: true };
const bagsOff = { nil: true, bags: false };

function bids(
  a: { tricks: number; nil?: boolean },
  b: { tricks: number; nil?: boolean },
  c: { tricks: number; nil?: boolean },
  d: { tricks: number; nil?: boolean },
): SpadesBid[] {
  return [
    { seat: 0, tricks: a.tricks, nil: a.nil === true },
    { seat: 1, tricks: b.tricks, nil: b.nil === true },
    { seat: 2, tricks: c.tricks, nil: c.nil === true },
    { seat: 3, tricks: d.tricks, nil: d.nil === true },
  ];
}

describe('reviewer scoring examples A–H', () => {
  it('A) bids 3+4, takes 8 => +71, 1 bag', () => {
    const team = scoreTeam(
      bids({ tricks: 3 }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [4, 3, 4, 2],
      0,
      0,
      0,
      on,
    );
    expect(team.contract).toBe(7);
    expect(team.nonNilTricks).toBe(8);
    expect(team.made).toBe(true);
    expect(team.delta).toBe(71);
    expect(team.bagsAfter).toBe(1);
    expect(team.bagPenalty).toBe(0);
  });

  it('B) bid 7, takes 6 => -70, 0 new bags', () => {
    const team = scoreTeam(
      bids({ tricks: 3 }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [3, 4, 3, 3],
      0,
      0,
      0,
      on,
    );
    expect(team.contract).toBe(7);
    expect(team.nonNilTricks).toBe(6);
    expect(team.made).toBe(false);
    expect(team.delta).toBe(-70);
    expect(team.bagsAfter).toBe(0);
  });

  it('C) prior 9 bags, bid 5, takes 8 => +53-100=-47, bags=2', () => {
    const team = scoreTeam(
      bids({ tricks: 2 }, { tricks: 3 }, { tricks: 3 }, { tricks: 3 }),
      [4, 3, 4, 2],
      0,
      0,
      9,
      on,
    );
    expect(team.contract).toBe(5);
    expect(team.nonNilTricks).toBe(8);
    expect(team.overtricks).toBe(3);
    expect(team.contractDelta).toBe(53);
    expect(team.bagPenalty).toBe(100);
    expect(team.delta).toBe(-47);
    expect(team.bagsAfter).toBe(2);
  });

  it('D) nil succeeds + partner bid 4 made exactly => +140', () => {
    const team = scoreTeam(
      bids({ tricks: 0, nil: true }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [0, 4, 4, 5],
      0,
      0,
      0,
      on,
    );
    expect(team.contract).toBe(4);
    expect(team.nonNilTricks).toBe(4);
    expect(team.made).toBe(true);
    expect(team.nilDelta).toBe(100);
    expect(team.delta).toBe(140);
    expect(team.bagsAfter).toBe(0);
  });

  it('E) nil fails 2; partner bids 4 / takes 4 => +40-100 +2 bags = -58', () => {
    const team = scoreTeam(
      bids({ tricks: 0, nil: true }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [2, 4, 4, 3],
      0,
      0,
      0,
      on,
    );
    expect(team.contract).toBe(4);
    expect(team.nonNilTricks).toBe(4);
    expect(team.nilTricks).toBe(2);
    expect(team.made).toBe(true);
    expect(team.contractDelta).toBe(40);
    expect(team.nilDelta).toBe(-100);
    expect(team.bagsTaken).toBe(2);
    expect(team.delta).toBe(-58);
  });

  it('F) nil fails 2; partner bid 4 / takes 3 => -40-100 +2 bags = -138', () => {
    const team = scoreTeam(
      bids({ tricks: 0, nil: true }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [2, 4, 3, 4],
      0,
      0,
      0,
      on,
    );
    expect(team.nonNilTricks).toBe(3);
    expect(team.made).toBe(false);
    expect(team.contractDelta).toBe(-40);
    expect(team.nilDelta).toBe(-100);
    expect(team.bagsTaken).toBe(2);
    expect(team.delta).toBe(-138);
  });

  it('G) both teams cross 500: higher total wins; equal totals continue', () => {
    expect(matchOver([520, 510], 500)).toEqual({ winner: 0 });
    expect(matchOver([510, 520], 500)).toEqual({ winner: 1 });
    expect(matchOver([500, 500], 500)).toBeNull();
    expect(matchOver([499, 480], 500)).toBeNull();
    const result = matchResult([520, 510], [2, 4], 500);
    expect(result?.winner).toBe(0);
    expect(result?.reason).toBe('first to 500');
    expect(result?.rankings.filter((row) => row.rank === 1).map((row) => row.seat)).toEqual([0, 2]);
  });

  it('overtime: [500,500] then [450,480] names a winner; [450,450] continues', () => {
    expect(matchOver([500, 500], 500)).toBeNull();
    expect(matchOver([450, 480], 500)).toBeNull();
    expect(matchOver([450, 480], 500, true)).toEqual({ winner: 1 });
    expect(matchOver([450, 450], 500, true)).toBeNull();
    const result = matchResult([450, 480], [0, 0], 500, true);
    expect(result?.rankings.filter((row) => row.rank === 1).map((row) => row.seat)).toEqual([1, 3]);
    expect(result?.reason).toBe('overtime');
  });

  it('H) bag penalty works from negative scores and multiple cycles', () => {
    const team = scoreTeam(
      bids({ tricks: 2 }, { tricks: 3 }, { tricks: 2 }, { tricks: 3 }),
      [9, 2, 8, 7],
      0,
      -80,
      8,
      on,
    );
    // contract 4, took 17, overtricks 13, +40+13=53; bags 8+13=21 → 2 cycles −200, bags 1
    expect(team.contractDelta).toBe(53);
    expect(team.bagPenalty).toBe(200);
    expect(team.delta).toBe(-147);
    expect(team.scoreAfter).toBe(-227);
    expect(team.bagsAfter).toBe(1);
  });
});

describe('config off paths', () => {
  it('bags off: made contract scores 10× with no overtrick points or bags', () => {
    const team = scoreTeam(
      bids({ tricks: 3 }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [5, 3, 4, 1],
      0,
      0,
      4,
      bagsOff,
    );
    expect(team.delta).toBe(70);
    expect(team.bagsAfter).toBe(4);
    expect(team.bagPenalty).toBe(0);
  });

  it('bags off: failed nil still costs 100 and does not add bags', () => {
    const team = scoreTeam(
      bids({ tricks: 0, nil: true }, { tricks: 3 }, { tricks: 4 }, { tricks: 3 }),
      [2, 4, 4, 3],
      0,
      0,
      0,
      bagsOff,
    );
    expect(team.delta).toBe(-60);
    expect(team.bagsTaken).toBe(0);
  });
});

describe('scoreHand folds both teams', () => {
  it('returns a lastHand-shaped summary with per-team breakdown', () => {
    const scored = scoreHand({
      handNo: 2,
      dealer: 1,
      bids: bids({ tricks: 3 }, { tricks: 4 }, { tricks: 4 }, { tricks: 3 }),
      tricksBySeat: [4, 3, 4, 2],
      priorScores: [100, 80],
      priorBags: [2, 1],
      rules: on,
    });
    expect(scored.summary.teams).toHaveLength(2);
    expect(scored.summary.teams[0]!.delta).toBe(71);
    expect(scored.scores[0]).toBe(171);
    expect(scored.bags[0]).toBe(3);
  });
});
