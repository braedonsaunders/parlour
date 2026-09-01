/**
 * How large a balance simulation should run.
 *
 * ## Why this exists
 *
 * Balance gates assert things like "Hard beats Easy at least 55% of the time"
 * and "no persona falls outside a 25–75% band". Those are *statistical* claims,
 * and a statistical claim checked over 32 or 60 games is mostly noise: the
 * confidence interval on a 60-game win rate is roughly ±13 points, which is
 * wider than several of the bands being asserted.
 *
 * Run in the blocking CI lane, such a test fails for reasons that have nothing
 * to do with the bots. Three of the last eight `main` runs were red, and one of
 * the fixes was literally `test(ratscrew): allow balance gate under CI load` —
 * the failure mode was a slow shared runner, not a regressed policy.
 *
 * So the two kinds of assertion are separated:
 *
 * - **Quick** (default, every PR): determinism, structural coverage, and the
 *   negative gates — an impossible threshold must fail, every persona must be
 *   represented, the same seed must reproduce the same report, and no match may
 *   stall. These are exact, cheap, and cannot flake.
 * - **Full** (`PARLOUR_FULL_SIM=1`, push lane): the win-rate bands, at a sample
 *   size where they actually mean something.
 *
 * A skipped band assertion names itself as skipped rather than passing
 * silently — the point is to stop pretending, not to stop measuring.
 *
 * This module lives under `src/sim/`, which ESLint exempts from the engine's
 * purity rules, because reading an environment variable is exactly the kind of
 * host coupling the rest of the engine must never have.
 */

export type SimScale = 'quick' | 'full';

function envFlag(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.PARLOUR_FULL_SIM;
}

export function simScale(): SimScale {
  const flag = envFlag();
  return flag === '1' || flag === 'true' ? 'full' : 'quick';
}

export function isFullSim(): boolean {
  return simScale() === 'full';
}

/** Sample size for the current scale. */
export function simGames(quick: number, full: number): number {
  return isFullSim() ? full : quick;
}

/**
 * Suffix for a test that only asserts its statistics at full scale, so the
 * quick run reports what it did not check instead of looking complete.
 */
export function scaleNote(): string {
  return isFullSim() ? '[full sample]' : '[quick sample — bands checked on push]';
}
