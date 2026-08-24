import { describe, expect, it } from 'vitest';
import { runBalanceGates } from './gates';

describe('cribbage balance gates', () => {
  it('hard beats easy and no persona is degenerate', { timeout: 120_000 }, () => {
    // Sixty games gives every persona twenty appearances in the deterministic
    // round robin. Thirty gave only ten and made one ordinary 1–9 split look
    // like degeneracy against a 12% lower bound.
    const report = runBalanceGates({ games: 60 });
    expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(report.thresholds.headToHeadMin);
    expect(report.personas.failures).toEqual([]);
    expect(report.stalls).toBe(0);
    expect(report.passed).toBe(true);
  });
});
