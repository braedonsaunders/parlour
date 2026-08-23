import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

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
  });

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
});
