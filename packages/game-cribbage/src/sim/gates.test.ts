import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { runBalanceGates } from './gates';

/**
 * Sixty games gives every persona twenty appearances in the deterministic round
 * robin, which was enough to stop one ordinary 1–9 split reading as degeneracy
 * — but it is still far too few to *bound* a win rate, and it is slow enough to
 * flake on a loaded runner. The band assertions moved to the nightly full run;
 * what stays here is exact. See @parlour/engine/sim.
 */
/** Structural checks are exact, so they stay small however the suite is run. */
const QUICK_GAMES = 8;
/** Band checks need a sample that can actually bound a win rate. */
const BAND_GAMES = simGames(QUICK_GAMES, 600);

describe('cribbage balance gates', () => {
  it('finishes every match and seats every persona', () => {
    const report = runBalanceGates({ games: QUICK_GAMES });
    expect(report.stalls).toBe(0);
    expect(report.personas.rows.length).toBeGreaterThan(0);
    for (const row of report.personas.rows) expect(row.games).toBeGreaterThan(0);
  });

  it.runIf(isFullSim())(
    `hard beats easy and no persona is degenerate ${scaleNote()}`,
    () => {
      const report = runBalanceGates({ games: BAND_GAMES });
      expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(report.thresholds.headToHeadMin);
      expect(report.personas.failures).toEqual([]);
      expect(report.stalls).toBe(0);
      expect(report.passed).toBe(true);
    },
    600_000,
  );
});
