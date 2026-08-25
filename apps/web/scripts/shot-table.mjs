/**
 * Proves the table still looks the same.
 *
 * The performance work here is allowed to change how an effect is achieved and
 * not how it looks, and most of the argument for "this is visually identical"
 * is reasoning about CSS and easing curves. Reasoning is not evidence. This
 * takes the picture.
 *
 * The stress rig is seeded, and `?bench=N` leaves the table in a settled state
 * after exactly N bursts, so two builds fed the same URL land on the same game
 * state with nothing in flight — which makes a pixel comparison meaningful
 * rather than a race against an animation.
 *
 *   node scripts/shot-table.mjs <export-dir> <out.png> [bursts]
 */

import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(process.cwd(), process.argv[2] ?? 'out');
const target = resolve(process.cwd(), process.argv[3] ?? 'table.png');
const bursts = Number(process.argv[4] ?? 40);
const port = Number(process.env.PERF_PORT ?? 4351);

const SCENARIOS = process.env.PERF_QUERY
  ? [{ id: 'custom', query: process.env.PERF_QUERY }]
  : [
      { id: '7seat', query: 'seats=7&hand=18&opponentHand=12&pickup=6&pickupEvery=4' },
      { id: '4seat', query: 'seats=4&hand=10&opponentHand=7&pickup=4&pickupEvery=5' },
    ];

if (!existsSync(dir)) {
  console.error(`no such export directory: ${dir}`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });

const server = spawn(
  process.execPath,
  [fileURLToPath(new URL('./serve-export.mjs', import.meta.url)), dir, String(port)],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' },
);
const base = `http://127.0.0.1:${port}`;
for (let attempt = 0; ; attempt += 1) {
  if (attempt > 80) {
    server.kill();
    throw new Error(`export at ${dir} never served`);
  }
  try {
    if ((await fetch(`${base}/dev/stress/`, { signal: AbortSignal.timeout(500) })).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
for (const scenario of SCENARIOS) {
  const context = await browser.newContext({
    viewport: devices['iPhone 14'].viewport,
    deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${base}/dev/stress/?${scenario.query}&bench=${bursts}`);
  await page
    .locator('[data-testid="stress-bench"]')
    .waitFor({ state: 'attached', timeout: 180_000 });
  // The canvas scene drifts on its own clock and would differ between two runs
  // for reasons that have nothing to do with the table. The table is what is
  // under test, so the scene is frozen out of the frame.
  await page.addStyleTag({ content: 'canvas { visibility: hidden !important }' });
  // PERF_CSS restores a rule under suspicion, so a visual difference can be
  // bisected without a rebuild per hypothesis.
  if (process.env.PERF_CSS) await page.addStyleTag({ content: process.env.PERF_CSS });
  // Long enough for every flight, burst and settle to have finished.
  await page.waitForTimeout(2_500);
  const path = target.replace(/\.png$/, `.${scenario.id}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  console.log(`  wrote ${path}`);
  await context.close();
}

await browser.close();
server.kill();
