import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './sim/gates';
import { heartsGame } from './game';

describe('balance gates', () => {
  it('exposes calibrated thresholds', () => {
    expect(DEFAULT_THRESHOLDS.hardVsEasyMin).toBeGreaterThan(0.25);
    expect(DEFAULT_THRESHOLDS.easyVsHardMax).toBeLessThan(1 - DEFAULT_THRESHOLDS.hardVsEasyMin + 0.05);
    expect(DEFAULT_THRESHOLDS.personaBandMin).toBeLessThan(0.2);
    expect(DEFAULT_THRESHOLDS.personaBandMax).toBeGreaterThan(0.3);
  });

  it('runs small mixed batches and reports per-label rows', () => {
    const report = runBalanceGates({ games: 6 });
    expect(report.games).toBe(6);
    expect(report.ladder.rows.length).toBeGreaterThan(0);
    expect(report.personas.rows.length).toBeGreaterThan(0);
    for (const row of [...report.ladder.rows, ...report.personas.rows]) {
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('plays every gate game to completion under the event budget', () => {
    // runBalanceGates throws on stalls unless tolerated — a clean run is the assertion
    expect(() => runBalanceGates({ games: 4 })).not.toThrow();
    expect(heartsGame.bots.length).toBe(3);
  });
});
