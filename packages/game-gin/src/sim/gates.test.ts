import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

/**
 * Gin's gates used to run 32 games under a 240-second timeout and assert the
 * tier gap from that sample. Both halves of that were a problem: 32 games is
 * far too few to bound a win rate, and 240 seconds on a shared runner is the
 * flake this suite kept producing. See @parlour/engine/sim for the split.
 */
/** Structural checks are exact, so they stay small however the suite is run. */
const QUICK_GAMES = 8;
/** Band checks need a sample that can actually bound a win rate. */
const BAND_GAMES = simGames(QUICK_GAMES, 400);

const report = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260824 });

describe('balance gates', () => {
  it('produces a deterministic report for a fixed seed', () => {
    const again = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260824 });
    expect(report.headToHead.hardWinRate).toBe(again.headToHead.hardWinRate);
    expect(report.personas.rows.map((row) => row.winRate)).toEqual(
      again.personas.rows.map((row) => row.winRate),
    );
    expect(report.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('seats every persona and finishes every match', () => {
    expect(report.personas.rows).toHaveLength(6);
    for (const row of report.personas.rows) {
      expect(row.games).toBeGreaterThan(0);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it.runIf(isFullSim())(
    `keeps the tier gap decisive and every persona inside its band ${scaleNote()}`,
    () => {
      const full = runBalanceGates({ games: BAND_GAMES, baseSeed: 20260824 });
      expect(full.headToHead.hardWinRate).toBeGreaterThan(full.headToHead.easyWinRate);
      expect(full.headToHead.hardWinRate).toBeGreaterThanOrEqual(0.55);
      expect(full.passed).toBe(true);
    },
    600_000,
  );
});
