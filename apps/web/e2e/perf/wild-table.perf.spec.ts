import { expect, test, type Page } from '@playwright/test';
import { formatStats, startSampling, stopSampling, type FrameStats } from './frame-sampler';

/**
 * What a phone actually has to survive at a Wild table.
 *
 * The suite runs two kinds of scenario. The `/wild/table/` ones are the real
 * game — real engine, real bots, real deal — and prove the numbers below are
 * about the shipping table rather than the harness. The stress-rig ones dial
 * the same renderer past anything the rules can reach: seven seats, an
 * eighteen-card fan, a burst every 420ms, and a six-card penalty counted out
 * card by card every fourth burst.
 *
 * The rig exists because Wild caps at four seats. A player asking for "six
 * bots and big hands" is describing a table President, Poker and Oh Hell all
 * seat today on this exact shell, so the ceiling is worth measuring even though
 * Wild itself will never reach it.
 *
 * No hard thresholds are asserted beyond "the table stayed alive": frame timing
 * in a headless browser is comparable to itself and to nothing else. The value
 * is the printed line, diffed against the previous run.
 */

const SAMPLE_MS = 9_000;

/** Wild's own ceiling: four seats, party rules, fast bots. */
const REAL_TABLE = '/wild/table/';

/** You plus six bots, an eighteen-card fan, and a stack landing every 1.7s. */
const STRESS_MAX = '/dev/stress/?seats=7&hand=18&opponentHand=12&stepMs=420&pickup=6&pickupEvery=4';

/** The same rig at Wild's real shape, for a like-for-like against the game. */
const STRESS_WILD_SHAPE =
  '/dev/stress/?seats=4&hand=10&opponentHand=7&stepMs=600&pickup=4&pickupEvery=5';

const results: string[] = [];

test.afterAll(() => {
  if (results.length > 0) {
    // eslint-disable-next-line no-console -- the report is the point of the run
    console.log(`\n  Wild table frame budget\n  ${'-'.repeat(118)}\n${results.join('\n')}\n`);
  }
});

/**
 * A phone is not a laptop. Chromium can be told so directly; WebKit cannot, so
 * the WebKit projects measure an unthrottled engine and are read for their
 * shape rather than their absolute numbers.
 */
async function throttleCpu(page: Page, rate: number): Promise<void> {
  if (test.info().project.name.includes('chromium') === false || rate <= 1) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
}

async function measure(page: Page, label: string, url: string): Promise<FrameStats> {
  await throttleCpu(page, Number(process.env.PERF_CPU ?? 4));
  await page.goto(url);

  // Never measure the deal: it is a one-off cascade, and averaging it into a
  // steady-state sample hides exactly the regressions this suite is for.
  const hand = page.locator('[role="list"][data-zone]').first();
  await expect(hand).toBeVisible({ timeout: 30_000 });
  await expect(hand.locator('[role="listitem"]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_500);

  await startSampling(page);
  await page.waitForTimeout(SAMPLE_MS);
  const stats = await stopSampling(page);

  results.push(`  ${formatStats(`${test.info().project.name} · ${label}`, stats)}`);
  return stats;
}

test.describe('table frame budget', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('the shipping Wild table holds its frames @perf', async ({ page }) => {
    const stats = await measure(page, 'wild solo (4 seats)', REAL_TABLE);
    // The table is still animating rather than wedged: a frozen page would show
    // a handful of rAF callbacks and no blocking at all.
    expect(stats.frames.count).toBeGreaterThan(60);
  });

  test('the rig at Wild shape matches the real table @perf', async ({ page }) => {
    const stats = await measure(page, 'rig · wild shape', STRESS_WILD_SHAPE);
    expect(stats.bursts ?? 0).toBeGreaterThan(4);
  });

  test('seven seats and an eighteen-card fan stay on their feet @perf', async ({ page }) => {
    const stats = await measure(page, 'rig · 7 seats / 18 cards', STRESS_MAX);
    expect(stats.bursts ?? 0).toBeGreaterThan(4);
    // The rig must have kept dealing for the whole sample — a table that stalls
    // under load would post a flattering frame time for the wrong reason.
    expect(stats.frames.count).toBeGreaterThan(60);
  });
});
