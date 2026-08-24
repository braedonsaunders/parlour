import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

// one shared report keeps this suite honest about gates without re-running sims
const report = runBalanceGates({ games: 32, baseSeed: 20260824 });

describe('balance gates', () => {
  it('produces a deterministic report for a fixed seed', () => {
    const again = runBalanceGates({ games: 32, baseSeed: 20260824 });
    expect(report.headToHead.hardWinRate).toBe(again.headToHead.hardWinRate);
    expect(report.personas.rows.map((row) => row.winRate)).toEqual(
      again.personas.rows.map((row) => row.winRate),
    );
    expect(report.personas.rows).toHaveLength(6);
    expect(report.thresholds).toEqual(DEFAULT_THRESHOLDS);
  }, 240_000);

  it('keeps the tier gap decisive and every persona inside its band', () => {
    expect(report.headToHead.hardWinRate).toBeGreaterThan(report.headToHead.easyWinRate);
    expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(0.55);
    expect(report.passed).toBe(true);
  }, 240_000);
});
