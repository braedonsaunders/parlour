import { describe, expect, it } from 'vitest';
import { runBalanceGates } from './gates';

describe('president balance gates', () => {
  it('passes the ladder, persona band, and pacing gates on a small sample', () => {
    const report = runBalanceGates({ games: 60, baseSeed: 777 });
    expect(report.ladder.sharpAboveRookieRate).toBeGreaterThanOrEqual(0.5);
    expect(report.pace.averageDeals).toBeLessThanOrEqual(7);
    for (const row of report.personas.rows) {
      expect(row.winRate).toBeLessThanOrEqual(report.thresholds.sharpWinMax);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);
});
