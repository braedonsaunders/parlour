import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

const BAND_GAMES = simGames(8, 400);

describe('runBalanceGates', () => {
  it('produces a deterministic report for a fixed seed', () => {
    const opts = {
      games: 40,
      baseSeed: 1234,
      thresholds: { ...DEFAULT_THRESHOLDS, headToHeadMin: 0.5 },
    };
    const a = runBalanceGates(opts);
    const b = runBalanceGates(opts);
    expect(a).toEqual(b);
    expect(a.personas.rows).toHaveLength(6);
    expect(a.headToHead.games).toBe(40);
    expect(typeof a.headToHead.hardWinRate).toBe('number');
  }, 60_000);

  it('fails when the head-to-head bar is set impossibly high', () => {
    const report = runBalanceGates({
      games: 30,
      baseSeed: 7,
      thresholds: { ...DEFAULT_THRESHOLDS, headToHeadMin: 0.999 },
    });
    expect(report.headToHead.passes).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('fails when the persona band excludes everyone', () => {
    const report = runBalanceGates({
      games: 30,
      baseSeed: 7,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        personaBandMin: 0.9,
        personaBandMax: 0.91,
      },
    });
    expect(report.personas.failures.length).toBeGreaterThan(0);
    expect(report.personas.passes).toBe(false);
  }, 60_000);

  it('rejects non-positive game counts', () => {
    expect(() => runBalanceGates({ games: 0 })).toThrow(/positive integer/);
  });

  it.runIf(isFullSim())(
    `keeps the tier gap and persona bands at full sample ${scaleNote()}`,
    () => {
      const report = runBalanceGates({ games: BAND_GAMES, baseSeed: 20260824 });
      expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(
        DEFAULT_THRESHOLDS.headToHeadMin,
      );
      expect(report.personas.passes, report.personas.failures.join('; ')).toBe(true);
      expect(report.passed).toBe(true);
    },
    600_000,
  );
});
