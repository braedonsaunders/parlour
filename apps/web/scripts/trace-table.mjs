/**
 * What the *renderer* spends on a stressed table.
 *
 * The CPU profile said the answer was "(program)" — 80%+ of the main thread
 * inside the engine rather than inside our JavaScript. That is style recalc,
 * layout, paint and raster, and a sampling profiler cannot see into it. This
 * takes a DevTools timeline trace instead and totals it by phase, which is what
 * points at a CSS filter or a composited layer rather than a function.
 *
 *   node scripts/trace-table.mjs [url-path] [seconds] [cpu-throttle]
 */

import { chromium, devices } from '@playwright/test';

const path =
  process.argv[2] ??
  '/dev/stress/?seats=7&hand=18&opponentHand=12&stepMs=420&pickup=6&pickupEvery=4';
const seconds = Number(process.argv[3] ?? 8);
const throttle = Number(process.argv[4] ?? 4);
const base = process.env.PERF_BASE ?? 'http://127.0.0.1:4321';

/** The phases worth naming; everything else is bookkeeping. */
const PHASES = {
  ParseHTML: 'parse html',
  ScheduleStyleRecalculation: 'style schedule',
  UpdateLayoutTree: 'style recalc',
  InvalidateLayout: 'layout invalidate',
  Layout: 'layout',
  UpdateLayerTree: 'layer tree',
  Paint: 'paint (record)',
  PaintImage: 'paint image',
  RasterTask: 'raster',
  Rasterize: 'raster',
  CompositeLayers: 'composite',
  Commit: 'commit',
  FunctionCall: 'script: call',
  TimerFire: 'script: timer',
  EventDispatch: 'script: event',
  FireAnimationFrame: 'script: rAF',
  MajorGC: 'gc',
  MinorGC: 'gc',
  GCEvent: 'gc',
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: devices['iPhone 14'].viewport,
  deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
  hasTouch: true,
});
const page = await context.newPage();
const session = await context.newCDPSession(page);
if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

await page.goto(`${base}${path}`);
await page
  .locator('[role="list"][data-zone] [role="listitem"]')
  .first()
  .waitFor({ timeout: 30_000 });
await page.waitForTimeout(2_500);

const events = [];
session.on('Tracing.dataCollected', ({ value }) => events.push(...value));
const collected = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));

await session.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: {
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
  },
});
await page.waitForTimeout(seconds * 1_000);
await session.send('Tracing.end');
await collected;

// Complete ('X') events carry their own duration; nested ones double-count, so
// only top-level phases are totalled and script phases are reported separately.
const totals = new Map();
const counts = new Map();
for (const event of events) {
  if (event.ph !== 'X' || typeof event.dur !== 'number') continue;
  const phase = PHASES[event.name];
  if (!phase) continue;
  totals.set(phase, (totals.get(phase) ?? 0) + event.dur / 1000);
  counts.set(phase, (counts.get(phase) ?? 0) + 1);
}

const frames = events.filter((event) => event.name === 'DrawFrame' || event.name === 'DrawFrames');
const wall = seconds * 1000;
console.log(`\n  ${path}`);
console.log(`  ${wall}ms wall · ${throttle}x CPU throttle · ${frames.length} frames drawn\n`);
console.log('   total ms   share    count   phase');
console.log(`  ${'-'.repeat(60)}`);
for (const [phase, ms] of [...totals.entries()].sort((a, b) => b[1] - a[1])) {
  const share = `${((ms / wall) * 100).toFixed(1)}%`;
  console.log(
    `  ${ms.toFixed(1).padStart(9)}  ${share.padStart(6)}  ${String(counts.get(phase)).padStart(7)}   ${phase}`,
  );
}
console.log('');

await browser.close();
