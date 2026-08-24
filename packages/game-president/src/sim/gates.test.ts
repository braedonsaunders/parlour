import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { runBalanceGates } from './gates';

/** See @parlour/engine/sim for why the band assertions are nightly-only. */
/** Structural checks are exact, so they stay small however the suite is run. */
const QUICK_GAMES = 8;
/** Band checks need a sample that can actually bound a win rate. */
const BAND_GAMES = simGames(QUICK_GAMES, 600);

describe('president balance gates', () => {
  it('finishes every match at a sane pace', () => {
    const report = runBalanceGates({ games: QUICK_GAMES, baseSeed: 777 });
    expect(report.pace.averageDeals).toBeGreaterThan(0);
    for (const row of report.personas.rows) {
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it.runIf(isFullSim())(
    `passes the ladder, persona band, and pacing gates ${scaleNote()}`,
    () => {
      const report = runBalanceGates({ games: BAND_GAMES, baseSeed: 777 });
      expect(report.ladder.sharpAboveRookieRate).toBeGreaterThanOrEqual(0.5);
      expect(report.pace.averageDeals).toBeLessThanOrEqual(7);
      for (const row of report.personas.rows) {
        expect(row.winRate).toBeLessThanOrEqual(report.thresholds.sharpWinMax);
      }
    },
    600_000,
  );
});
