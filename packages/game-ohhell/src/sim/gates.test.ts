import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../bots/personas';
import { tierBot } from '../bots';
import { DEFAULT_THRESHOLDS, runBalanceGates, seatWinShare, type GateThresholds } from './gates';

describe('bot roster', () => {
  it('ships three distinct tiers and six personas', () => {
    expect(tierBot(1).id).not.toBe(tierBot(3).id);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('balance gates', () => {
  const loose: GateThresholds = {
    headToHeadMin: 0,
    personaBandMin: 0,
    personaBandMax: 1,
    symmetryMaxSpread: 1,
    maxStallRate: 1,
  };

  it('runs a small mixed batch without stalling', () => {
    const report = runBalanceGates({ games: 4, baseSeed: 11, thresholds: loose });
    expect(report.stalls).toBe(0);
    expect(report.headToHead.games).toBe(4);
    expect(report.personas.rows).toHaveLength(PERSONAS.length);
    expect(report.symmetry.shares).toHaveLength(4);
    expect(report.passed).toBe(true);
  }, 30_000);

  it('keeps the default threshold set meaningful', () => {
    // a fair individual share on four seats is 25%; Hard must clear it well
    expect(DEFAULT_THRESHOLDS.headToHeadMin).toBeGreaterThan(0.25);
    expect(DEFAULT_THRESHOLDS.personaBandMin).toBeLessThan(0.25);
    expect(DEFAULT_THRESHOLDS.personaBandMax).toBeGreaterThan(0.25);
    expect(DEFAULT_THRESHOLDS.maxStallRate).toBeLessThanOrEqual(0.01);
  });
});

describe('seatWinShare', () => {
  const result = (winner: number) => ({
    winner,
    rankings: [{ seat: winner, rank: 1 }],
    reason: 'test',
  });

  it('credits tied winners fractionally', () => {
    const tie = { winner: null, rankings: [], reason: 'tie' };
    const records = [
      { seed: 1, seats: 4, events: 10, result: result(0), winners: [0], stalled: false },
      { seed: 2, seats: 4, events: 10, result: tie as never, winners: [1, 3], stalled: false },
    ];
    expect(seatWinShare(records, 0)).toBeCloseTo(0.5);
    expect(seatWinShare(records, 1)).toBeCloseTo(0.25);
    expect(seatWinShare(records, 3)).toBeCloseTo(0.25);
    expect(seatWinShare(records, 2)).toBe(0);
  });
});
