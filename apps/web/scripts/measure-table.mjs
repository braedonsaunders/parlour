/**
 * The measurement the optimisation work is steered by.
 *
 * The first attempt at this steered by frame rate and was worthless: headless
 * rAF is driven by a timer rather than a display, so run-to-run spread on the
 * same build was wider than any change worth making — switching effects *off*
 * routinely measured slower than leaving them on. Anything concluded from that
 * would have been noise dressed as a finding.
 *
 * What is stable is the work itself. A DevTools timeline trace totals the
 * renderer by phase — style recalc, layout, paint, raster, script — and those
 * totals barely move between runs of the same build, because they count work
 * done rather than frames delivered. Main-thread blocking is the same kind of
 * number. So this reports those, takes the median of several runs, and prints
 * the spread alongside so a "win" smaller than the noise floor is visible as
 * such.
 *
 *   node scripts/measure-table.mjs [runs] [seconds] [cpu-throttle]
 *
 * `PERF_PATH` chooses the table; `PERF_LABEL` names the row.
 */

import { chromium, devices } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const runs = Number(process.argv[2] ?? 3);
const seconds = Number(process.argv[3] ?? 6);
const throttle = Number(process.argv[4] ?? 4);
const base = process.env.PERF_BASE ?? 'http://127.0.0.1:4321';
const label = process.env.PERF_LABEL ?? 'run';
const path =
  process.env.PERF_PATH ??
  '/dev/stress/?seats=7&hand=18&opponentHand=12&stepMs=420&pickup=6&pickupEvery=4';

const SAMPLER = readFileSync(new URL('./perf-sampler.js', import.meta.url), 'utf8');

/**
 * Trace event names, grouped into the phases worth reporting.
 *
 * `Commit` is measured and deliberately excluded from the score. It is the
 * largest phase in every run — around 4.4 of every 6 seconds — which made it
 * look like the finding until a control run on a two-seat table holding one
 * card measured 5.4 seconds of it. It is the main thread parked waiting for a
 * headless compositor's frame deadline, not work the table caused, and the
 * `blocked` figure is starved by the same parked task. Both are printed so
 * nobody rediscovers them and mistakes them for a signal.
 *
 * What is left responds to load exactly as it should: between that idle control
 * and a seven-seat table, style recalc goes 69ms → 402ms, raster 36ms → 427ms
 * and script 473ms → 1,488ms. Those are the numbers to move.
 */
const PHASES = {
  UpdateLayoutTree: 'style',
  Layout: 'layout',
  UpdateLayerTree: 'layers',
  Paint: 'paint',
  RasterTask: 'raster',
  Rasterize: 'raster',
  Commit: 'commit',
  FunctionCall: 'script',
  TimerFire: 'script',
  EventDispatch: 'script',
  FireAnimationFrame: 'script',
  MajorGC: 'gc',
  MinorGC: 'gc',
};

/**
 * Composited layers, counted rather than timed.
 *
 * Every layer is a texture the GPU has to hold and the compositor has to walk,
 * and on iOS the ceiling is memory bandwidth long before it is arithmetic. The
 * count and the total texture area are structural — identical between runs of
 * the same build — which makes them the least noisy signal available and the
 * one that transfers best from this laptop to a phone.
 */
async function layerStats(session) {
  const settled = new Promise((resolve) => {
    let last = null;
    let timer = null;
    session.on('LayerTree.layerTreeDidChange', ({ layers }) => {
      last = layers ?? [];
      clearTimeout(timer);
      timer = setTimeout(() => resolve(last), 600);
    });
    setTimeout(() => resolve(last ?? []), 5_000);
  });
  await session.send('LayerTree.enable');
  const layers = await settled;
  const area = layers.reduce((all, layer) => all + (layer.width ?? 0) * (layer.height ?? 0), 0);
  return { count: layers.length, megapixels: area / 1_000_000 };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const spread = (values) => Math.max(...values) - Math.min(...values);

const browser = await chromium.launch();
const samples = [];

for (let run = 0; run < runs; run += 1) {
  const context = await browser.newContext({
    viewport: devices['iPhone 14'].viewport,
    deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
    hasTouch: true,
  });
  // PERF_INIT reaches what a stylesheet cannot — the canvas scene, chiefly,
  // which keeps painting into a `display: none` element and so cannot be
  // ablated with CSS at all.
  if (process.env.PERF_INIT) await context.addInitScript(process.env.PERF_INIT);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  await page.goto(`${base}${path}`);
  await page
    .locator('[role="list"][data-zone] [role="listitem"]')
    .first()
    .waitFor({ timeout: 30_000 });
  // PERF_CSS tests a hypothesis before it is worth writing: inject the change
  // as a stylesheet, measure, and only then go and make it properly.
  if (process.env.PERF_CSS) await page.addStyleTag({ content: process.env.PERF_CSS });
  await page.waitForTimeout(2_000);

  const events = [];
  session.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  const collected = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
    },
  });
  await page.evaluate(SAMPLER);
  await page.waitForTimeout(seconds * 1_000);
  const stats = await page.evaluate(() => window.__perfSampler.stop());
  await session.send('Tracing.end');
  await collected;

  const totals = {
    style: 0,
    layout: 0,
    layers: 0,
    paint: 0,
    raster: 0,
    commit: 0,
    script: 0,
    gc: 0,
  };
  const counts = { style: 0, layout: 0, paint: 0 };
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.dur !== 'number') continue;
    const phase = PHASES[event.name];
    if (!phase) continue;
    totals[phase] += event.dur / 1000;
    if (phase in counts) counts[phase] += 1;
  }
  const layers = await layerStats(session);
  samples.push({
    ...totals,
    styleN: counts.style,
    layoutN: counts.layout,
    layerCount: layers.count,
    layerMegapixels: layers.megapixels,
    stats,
  });
  await context.close();
}

await browser.close();

const pick = (key) => samples.map((sample) => sample[key]);
const row = {
  label,
  path,
  throttle,
  seconds,
  runs,
  style: median(pick('style')),
  styleN: median(pick('styleN')),
  layout: median(pick('layout')),
  layers: median(pick('layers')),
  paint: median(pick('paint')),
  raster: median(pick('raster')),
  commit: median(pick('commit')),
  script: median(pick('script')),
  gc: median(pick('gc')),
  layerCount: median(pick('layerCount')),
  layerMegapixels: median(pick('layerMegapixels')),
  blocked: median(samples.map((sample) => sample.stats.blocking.totalMs)),
  longTasks: median(samples.map((sample) => sample.stats.longTasks.totalMs)),
};
row.renderer = row.style + row.layout + row.paint + row.raster;
row.work = row.renderer + row.script + row.gc;

const ms = (value) => `${value.toFixed(0).padStart(6)}ms`;
const jitter = (key, values) => `±${spread(values).toFixed(0)}${key === 'layers' ? '' : 'ms'}`;

console.log(`\n  ${label} · ${path}`);
console.log(`  ${runs} runs × ${seconds}s · ${throttle}x CPU throttle · median (spread)\n`);
for (const [name, value, values] of [
  ['style recalc', row.style, pick('style')],
  ['layout', row.layout, pick('layout')],
  ['paint', row.paint, pick('paint')],
  ['raster', row.raster, pick('raster')],
  ['script', row.script, pick('script')],
  ['gc', row.gc, pick('gc')],
]) {
  console.log(`  ${name.padEnd(14)} ${ms(value)}   ${jitter(name, values)}`);
}
console.log(`  ${'-'.repeat(38)}`);
console.log(`  ${'WORK'.padEnd(14)} ${ms(row.work)}   ← the score`);
console.log(`  ${'style recalcs'.padEnd(14)} ${String(row.styleN).padStart(6)}`);
console.log(
  `  ${'layers'.padEnd(14)} ${String(row.layerCount).padStart(6)}   ${row.layerMegapixels.toFixed(1)} Mpx`,
);
console.log(`\n  headless artifacts, not a signal — see PHASES:`);
console.log(`  ${'commit'.padEnd(14)} ${ms(row.commit)}`);
console.log(`  ${'blocked'.padEnd(14)} ${ms(row.blocked)}`);
console.log('');

// Appended rather than overwritten: the history is the point, and a run that
// looks like a win against the wrong baseline is the failure mode to avoid.
const ledger = new URL('../../../output/table-perf.json', import.meta.url);
const file = fileURLToPath(ledger);
const history = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
history.push(row);
writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`);

function fileURLToPath(url) {
  return decodeURIComponent(url.pathname);
}
