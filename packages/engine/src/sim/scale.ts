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

/**
 * Wall-clock budget for a lane that measures LIVENESS rather than statistics.
 *
 * The duel suites drive real timers on purpose — they assert that a table under
 * churn keeps moving inside real deadlines, which a fake clock cannot speak to.
 * That makes them slow by construction: measured, the Wild coverage file alone
 * is 332s for three tests, because each duel runs until a real two-minute match
 * clock expires. On every PR that is minutes of wall clock spent re-proving
 * something that almost never changes, and the longer the window the more
 * chance a loaded runner overruns a deadline and reads a healthy table as
 * wedged — a flake that cost real time to chase.
 *
 * So these share the same split as the statistical gates: a quick lane with
 * short clocks and short budgets that still proves convergence, fault recovery
 * and replay, and a full lane with today's budgets for the long soak. Unlike
 * `simGames` this is opt-out rather than opt-in — see
 * `PARLOUR_FULL_SIM` — because the quick lane keeps the valuable assertions and
 * only gives up soak depth.
 */
export function simMs(quick: number, full: number): number {
  return isFullSim() ? full : quick;
}

/**
 * Whether the slow, real-time lanes run at all.
 *
 * Separate from {@link isFullSim} because the two answer different questions.
 * `PARLOUR_FULL_SIM` says "at full sample"; that is the right switch for a
 * statistical gate, where a bigger sample is strictly more signal. It is the
 * wrong switch for a six-minute soak, which nobody wants on every PR even at
 * quick scale — so the duel lane needs its own opt-in.
 */
export function isSlowLane(): boolean {
  const flag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.PARLOUR_SLOW_LANES;
  return flag === '1' || flag === 'true';
}
