import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { runBalanceGates } from './gates';

const QUICK_GAMES = 8;
const BAND_GAMES = simGames(QUICK_GAMES, 600);

describe('eights balance gates', () => {
  it('finishes every ladder game at a sane pace', () => {
    const report = runBalanceGates({ games: QUICK_GAMES, baseSeed: 111 });
    expect(report.stalls).toBe(0);
    for (const row of report.ladder.rows) {
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
    for (const row of report.tiers.rows) {
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it.runIf(isFullSim())(
    `passes the ladder and tier band gates ${scaleNote()}`,
    () => {
      const report = runBalanceGates({ games: BAND_GAMES, baseSeed: 111 });
      expect(report.ladder.passes).toBe(true);
      expect(report.tiers.passes).toBe(true);
      expect(report.passed).toBe(true);
    },
    600_000,
  );
});