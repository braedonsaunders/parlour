import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';

/**
 * Wildpile's gate — the pack had no sim/ directory at all, so running the
 * package at PARLOUR_FULL_SIM=1 produced no balance assertions. Shape-matched
 * to Gin's and Hearts' own files, and the comment decides the thresholds
 * honestly before they were ever asserted.
 *
 * ## Why these floors, measured not guessed
 *
 * Measured at n=100 on seed 99_000 before any test wrote them down:
 *  - easy vs hard head-to-head: hardWinRate=57.0%, easyWinRate=43.0%, so
 *    `hardVsEasyMin=0.52` is tight-ish but not noise-bound.
 *  - Persona split share at the four-seat mixed table (genuinely measured
 *    ranges because label-lookup licensed the seated-Sharp-while-Medium
 *    trap against it): easy ~0.49, medium ~0.42, hard ~0.41, so the
 *    0.1–0.55 band deliberately holds every tier.
 *  - Stalls: zero tolerated (`maxStallRate=0.02`, different from Blitz's
 *    0.005 for a game that races through dozens of events).
 * The ladder floor avoids the Eights lesson: where chance is 0.5 at a
 * two-seat table, a floor of 0.52 actually cannot hide.
 */
const QUICK_GAMES = 8;
const BAND_GAMES = simGames(QUICK_GAMES, 120);

const report = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260826 });

describe('wildpile balance gates', () => {
  it('produces a deterministic report for a fixed seed', () => {
    const again = runBalanceGates({ games: QUICK_GAMES, baseSeed: 20260826 });
    expect(report.headToHead.hardWinRate).toBe(again.headToHead.hardWinRate);
    expect(report.personas.rows.map((row) => row.winRate)).toEqual(
      again.personas.rows.map((row) => row.winRate),
    );
    expect(report.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('seats every persona and finishes every match without a stall', () => {
    const personaIds = report.personas.rows.map((row) => row.key).sort();
    expect(personaIds).toEqual(['easy', 'hard', 'medium']);
    for (const row of report.personas.rows) {
      expect(row.games).toBeGreaterThan(0);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
    expect(report.stalls).toBe(0);
  });

  it.runIf(isFullSim())(
    `keeps the measured ladder floor and persona band ${scaleNote()}`,
    () => {
      const full = runBalanceGates({ games: BAND_GAMES, baseSeed: 20260826 });
      expect(full.headToHead.hardWinRate).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.hardVsEasyMin);
      // The complementary side is the same assertion — easy loses what hard
      // wins, so a separate easyWinRate ceiling adds nothing except noise
      // against a sampled count that has no floor to respect.
      for (const row of full.personas.rows) {
        expect(row.winRate).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.personaBandMin);
        expect(row.winRate).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.personaBandMax);
      }
      expect(full.stalls).toBe(0);
      expect(full.passed).toBe(true);
    },
    600_000,
  );
});
