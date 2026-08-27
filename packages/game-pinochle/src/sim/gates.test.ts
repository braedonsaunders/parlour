import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';
import { DEFAULT_THRESHOLDS, runBalanceGates, teamWinShare, type GateThresholds } from './gates';

const QUICK_GAMES = 8;
const BAND_GAMES = simGames(QUICK_GAMES, 200);

describe('bot roster', () => {
  it('ships three distinct tiers and six personas', () => {
    expect(tierBot(1).id).not.toBe(tierBot(3).id);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    expect(makePersonaBot('dot').persona?.name).toBe('Dot');
  });
});

describe('balance gates', () => {
  const loose: GateThresholds = {
    ...DEFAULT_THRESHOLDS,
    headToHeadMin: 0,
    personaBandMin: 0,
    personaBandMax: 1,
    symmetryBandMin: 0,
    symmetryBandMax: 1,
  };

  it('runs a small mixed batch without stalling', () => {
    const report = runBalanceGates({ games: 4, baseSeed: 11, thresholds: loose });
    expect(report.stalls).toBe(0);
    expect(report.headToHead.games).toBe(4);
    expect(report.personas.rows.length).toBeGreaterThan(0);
  });

  it('keeps the default threshold set strict', () => {
    expect(DEFAULT_THRESHOLDS.headToHeadMin).toBeGreaterThanOrEqual(0.55);
    expect(DEFAULT_THRESHOLDS.maxStallRate).toBeLessThanOrEqual(0.01);
  });

  it.runIf(isFullSim())(
    `keeps the partnership tier gap and bands at full sample ${scaleNote()}`,
    () => {
      const report = runBalanceGates({ games: BAND_GAMES, baseSeed: 20260827 });
      expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(
        DEFAULT_THRESHOLDS.headToHeadMin,
      );
      expect(report.personas.passes).toBe(true);
      expect(report.symmetry.passes).toBe(true);
      expect(report.stalls).toBe(0);
      expect(report.passed).toBe(true);
    },
    600_000,
  );
});

describe('teamWinShare', () => {
  it('credits half a win to each partner', () => {
    const result = { winner: 0, rankings: [], reason: 'test' };
    const share = teamWinShare(
      [
        { seed: 1, seats: 4, events: 10, result, winners: [0, 2], stalled: false },
        { seed: 2, seats: 4, events: 10, result, winners: [1, 3], stalled: false },
      ],
      0,
    );
    expect(share).toBeCloseTo(0.5);
  });
});
