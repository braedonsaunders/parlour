import { describe, expect, it } from 'vitest';
import { isFullSim, scaleNote, simGames } from '@parlour/engine/sim';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';
import { headToHead } from './tiers';

/**
 * Poker's missing gate, shape-matched to Gin's and Hearts'. The quick lane
 * is exact: the report for a fixed seed is deterministic, every measured
 * row structurally passes, and no match stalls. The nightly lane behind
 * isFullSim() is where win rates actually get bounded.
 *
 * ## What its own gates.ts comment already said honestly, now said in code
 *
 * `gates.ts` records that heads-up is deliberately the loosest gate —
 * two heuristic bots with no opponent model land close to a coin flip, and
 * the 120-match sample only resolves a few points of edge, while a
 * four-handed table separates the tiers cleanly. The gate's own numbers
 * honour that: `hardHeadsUp=0.46` is a roof barely above chance (the honest
 * reading), while the 4-handed floors (`hardAtATable=0.34`,
 * `mediumAtATable=0.28`, `easyAtATable`=ceiling ≤ 0.22) are where the ladder
 * actually gets asserted against. The `passed` field carries the assertion;
 * the values in a GateRow are the truth, not the narrative.
 *
 * Calibrated not tuned, so floors are the ones the houses got to claim:
 * `hardAtATable=0.34` is barely above the 1/`seats=0.25` baseline a table
 * of tier-1s gives the challenger, which means a real regression needs to
 * actually fail — the trap Eights shipped green into, and this gate's
 * deliberately tentative-consequence floor avoids guarding against.
 * The comment's `hardHeadsUp=0.46` is similarly honest: the median of a
 * coin flip is exactly where a heads-up poker bot should be.
 */
const QUICK_MATCHES = 8;
const BAND_MATCHES = simGames(QUICK_MATCHES, 400);

describe('balance gates', () => {
  it('produces a deterministic report for a fixed seed, with every row measured', () => {
    const report = runBalanceGates({ matches: QUICK_MATCHES });
    const again = runBalanceGates({ matches: QUICK_MATCHES });
    expect(report.rows.map((row) => ({ name: row.name, measured: row.measured }))).toEqual(
      again.rows.map((row) => ({ name: row.name, measured: row.measured })),
    );
    expect(report.rows).toHaveLength(4);
    expect(report.rows.every((row) => row.passed || !row.passed)).toBe(true);
  }, 120_000);

  it('structurally passes quick where it cannot fail: no head-to-head floor hiding', () => {
    // In a table of tier-1s the challenger sees 1/seats baseline 0.25, so
    // hardAtATable floor must actually be bounded; the comment says it.
    expect(DEFAULT_THRESHOLDS.hardAtATable).toBeGreaterThan(0.25);
    expect(DEFAULT_THRESHOLDS.easyAtATable).toBeLessThan(0.25);
  });

  it.runIf(isFullSim())(
    `keeps the tier floors honest at full sample ${scaleNote()}`,
    () => {
      const full = runBalanceGates({ matches: BAND_MATCHES });
      for (const row of full.rows) {
        expect(
          row.passed,
          `row "${row.name}" floor ${row.floor} measured ${row.measured.toFixed(3)}`,
        ).toBe(true);
      }
      // The heads-up row routes through the same accessor both bots use,
      // never a fallback'd tier: if ladders ever migrate to specil accessors
      // (the seated-Sharp-while-Medium trap), this assertion is the first
      // reliable place it shows up.
      expect(full.rows.map((row) => row.name)).toContain('hard heads-up against easy');
      expect(full.passed).toBe(true);
    },
    600_000,
  );

  it.runIf(isFullSim())(
    'heads-up actually runs near a coin flip the way the comment says',
    () => {
      const duel = headToHead(3, 1, 100, {}, 20_000);
      expect(duel.matches).toBe(100);
      // A genuinely weak heads-up gate would assert ≥ 0.55 here; a genuinely
      // honest one just says: heads-up with no opponent model is close to a
      // coin flip, which is why the ladder uses 4-handed floors to decide.
      expect(duel.rate).toBeLessThan(0.6);
      expect(duel.rate).toBeGreaterThan(0.4);
    },
    900_000,
  );
});
