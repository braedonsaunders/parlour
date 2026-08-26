import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

/**
 * Hearts' gate, shape-matched to Gin's. The quick lane is exact: report is
 * deterministic for a fixed seed, every persona is seated, every match ends
 * without a stall. The nightly lane (isFullSim) is what actually bounds win
 * rates: Sharp clearly ahead of Harmless on the same ladder the gate's
 * `hardVsEasyMin` says the brand floor sits on.
 *
 * Calibrated rather than vibes: the floor was calibrated against the Gin
 * file's shape (exact structural checks quick, WinRateRow bands full), and
 * the `hardVsEasyMin=0.32` floor is the one the suite has to beat only when
 * a full sample runs it. `HEARTS_PERSONAS` draws policies out of the shared
 * persona cast so a ladder that pretends to seat Sharp while running Medium
 * — the exact bug that let Eights ship green — would show up as all-persona
 * naming drift before it reported wins.
 */
const QUICK_GAMES = 8;
const BAND_GAMES = simGames(QUICK_GAMES, 200);

const report = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260823 });

describe('balance gates', () => {
  it('produces a deterministic report for a fixed seed', () => {
    const again = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260823 });
    expect(report.ladder.rows.map((row) => row.winRate)).toEqual(
      again.ladder.rows.map((row) => row.winRate),
    );
    expect(report.personas.rows.map((row) => row.winRate)).toEqual(
      again.personas.rows.map((row) => row.winRate),
    );
    expect(report.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('seats every persona and finishes every match without a stall', () => {
    expect(report.personas.rows).toHaveLength(4);
    for (const row of report.personas.rows) {
      expect(row.games).toBeGreaterThan(0);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
    expect(report.stalls).toBe(0);
  });

  it.runIf(isFullSim())(
    `keeps the tier gap decisive and every persona inside its band ${scaleNote()}`,
    () => {
      const full = runBalanceGates({ games: BAND_GAMES, baseSeed: 20260823 });
      expect(full.ladder.rows.map((row) => row.key)).toContain('Sharp');
      expect(full.ladder.rows.map((row) => row.key)).toContain('Harmless');
      const sharp = full.ladder.rows.find((row) => row.key === 'Sharp');
      const harmless = full.ladder.rows.find((row) => row.key === 'Harmless');
      expect(sharp?.winRate ?? 0).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.hardVsEasyMin);
      expect(harmless?.winRate ?? 1).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.easyVsHardMax);
      for (const row of full.personas.rows) {
        expect(row.winRate).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.personaBandMin);
        expect(row.winRate).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.personaBandMax);
      }
      expect(full.stalls).toBe(0);
    },
    600_000,
  );
});
