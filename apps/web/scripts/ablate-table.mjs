/**
 * What each piece of the presentation is actually worth.
 *
 * Runs the stress table repeatedly, each time with one piece switched off from
 * the outside, and scores each run with the stable trace metrics that
 * `measure-table.mjs` established — style recalc, layout, paint, raster and
 * script. Frame rate is not used and neither is main-thread blocking: in a
 * headless browser both are dominated by a compositor wait that a two-seat idle
 * table pays just as much of as a seven-seat one.
 *
 * Nothing here is a proposed change. Switching an effect off is not an option —
 * the table is meant to look like this — so this is a measurement of what each
 * effect costs, to decide which ones are worth rebuilding to be cheaper.
 *
 *   node scripts/ablate-table.mjs [runs-per-ablation] [seconds] [cpu-throttle]
 */

import { chromium, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

const runs = Number(process.argv[2] ?? 2);
const seconds = Number(process.argv[3] ?? 6);
const throttle = Number(process.argv[4] ?? 4);
const base = process.env.PERF_BASE ?? 'http://127.0.0.1:4321';
const path =
  process.env.PERF_PATH ??
  '/dev/stress/?seats=7&hand=18&opponentHand=12&stepMs=420&pickup=6&pickupEvery=4';

const SAMPLER = readFileSync(new URL('./perf-sampler.js', import.meta.url), 'utf8');

/** Neutralises the diorama's drawing; CSS cannot, it paints into a hidden canvas. */
const MUTE_CANVAS = `
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ['fill','stroke','fillRect','strokeRect','drawImage','fillText','strokeText','putImageData']) {
    proto[name] = function () {};
  }
`;

/**
 * Pins every run to the same number of frames.
 *
 * Without this the comparison is circular: an ablation that makes the page
 * faster delivers more frames, so it does more rAF-driven work in the same six
 * seconds and scores as a regression — which is how "stop drawing the scene"
 * first measured as 154% *worse*. Normalising per frame does not fix it either,
 * because a fixed-rate animation like the diorama's 30fps draw lands on every
 * frame of a 20fps page and every other frame of a 60fps one.
 *
 * So the frame rate is held at 30 for every variant. Frame count becomes a
 * constant, work per second and work per frame agree, and the only thing left
 * varying between runs is the thing being ablated.
 */
const PIN_FRAME_RATE = `
  const raf = window.requestAnimationFrame.bind(window);
  const period = 1000 / 30;
  let due = 0;
  const waiting = [];
  let pumping = false;
  const pump = (now) => {
    pumping = false;
    if (now >= due) {
      due = now + period;
      const batch = waiting.splice(0, waiting.length);
      for (const callback of batch) {
        try { callback(now); } catch { /* a throwing callback is the app's problem */ }
      }
    }
    if (waiting.length > 0 && !pumping) { pumping = true; raf(pump); }
  };
  window.requestAnimationFrame = (callback) => {
    waiting.push(callback);
    if (!pumping) { pumping = true; raf(pump); }
    return waiting.length;
  };
  window.cancelAnimationFrame = () => {};
`;

const ABLATIONS = [
  { id: 'baseline' },
  { id: 'diorama not drawing', init: MUTE_CANVAS },
  { id: 'no backface-visibility', css: '* { backface-visibility: visible !important }' },
  { id: 'no hand-card filters', css: '[data-hand-card] * { filter: none !important }' },
  { id: 'no shadows anywhere', css: '*,*::before,*::after { box-shadow: none !important }' },
  {
    id: 'no infinite animations',
    css: '*,*::before,*::after { animation-iteration-count: 1 !important }',
  },
  { id: 'hand hidden', css: '[role="list"][data-zone] { display: none !important }' },
  { id: 'seats hidden', css: '[data-seat] { display: none !important }' },
  { id: 'fx flights hidden', css: '[data-card-flight] { display: none !important }' },
  { id: 'drop-fx hidden', css: '[data-testid="card-drop-fx"] { display: none !important }' },
  { id: 'announcer hidden', css: '[data-testid="wild-announcer"] { display: none !important }' },
  { id: 'turn clock hidden', css: '[data-testid="turn-clock"] { display: none !important }' },
];

const PHASES = {
  UpdateLayoutTree: 'style',
  Layout: 'layout',
  Paint: 'paint',
  RasterTask: 'raster',
  Rasterize: 'raster',
  FunctionCall: 'script',
  TimerFire: 'script',
  EventDispatch: 'script',
  FireAnimationFrame: 'script',
  MajorGC: 'gc',
  MinorGC: 'gc',
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const browser = await chromium.launch();
const rows = [];

for (const ablation of ABLATIONS) {
  const samples = [];
  for (let run = 0; run < runs; run += 1) {
    const context = await browser.newContext({
      viewport: devices['iPhone 14'].viewport,
      deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
      hasTouch: true,
    });
    await context.addInitScript(PIN_FRAME_RATE);
    if (ablation.init) await context.addInitScript(ablation.init);
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await page.goto(`${base}${path}`);
    await page
      .locator('[role="list"][data-zone] [role="listitem"]')
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    if (ablation.css) await page.addStyleTag({ content: ablation.css });
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

    const totals = { style: 0, layout: 0, paint: 0, raster: 0, script: 0, gc: 0 };
    for (const event of events) {
      if (event.ph !== 'X' || typeof event.dur !== 'number') continue;
      const phase = PHASES[event.name];
      if (phase) totals[phase] += event.dur / 1000;
    }
    const layers = await new Promise((resolve) => {
      let last = [];
      let timer = null;
      session.on('LayerTree.layerTreeDidChange', ({ layers: next }) => {
        last = next ?? [];
        clearTimeout(timer);
        timer = setTimeout(() => resolve(last), 500);
      });
      session.send('LayerTree.enable');
      setTimeout(() => resolve(last), 4_000);
    });
    samples.push({ ...totals, layerCount: layers.length, frames: stats.frames.count });
    await context.close();
  }

  const at = (key) => median(samples.map((sample) => sample[key]));
  const frames = Math.max(1, at('frames'));
  // Per frame, not per second. Totals measure throughput: make the page faster
  // and it does *more* work in the same wall clock, which reads as a
  // regression. Cost per delivered frame is what decides whether the next frame
  // fits in 16.7ms, and it is the only form of the number that can be compared
  // between a fast run and a slow one.
  const row = {
    id: ablation.id,
    style: at('style') / frames,
    layout: at('layout') / frames,
    paint: at('paint') / frames,
    raster: at('raster') / frames,
    script: at('script') / frames,
    layers: at('layerCount'),
    fps: frames / seconds,
  };
  row.work = row.style + row.layout + row.paint + row.raster + row.script + at('gc') / frames;
  rows.push(row);
}

await browser.close();

const baseline = rows[0];
console.log(`\n  ${path}`);
console.log(`  ${runs} runs × ${seconds}s each · ${throttle}x CPU throttle · median\n`);
console.log('  milliseconds of main-thread work per frame, at a pinned 30fps\n');
console.log(
  '  ablation                  style  layout   paint  raster  script  PER FRAME      Δ  layers    fps',
);
console.log(`  ${'-'.repeat(100)}`);
for (const row of rows) {
  const delta =
    row === baseline ? '' : `${(((row.work - baseline.work) / baseline.work) * 100).toFixed(0)}%`;
  console.log(
    `  ${row.id.padEnd(24)}` +
      `${row.style.toFixed(1).padStart(7)}${row.layout.toFixed(1).padStart(8)}` +
      `${row.paint.toFixed(1).padStart(8)}${row.raster.toFixed(1).padStart(8)}` +
      `${row.script.toFixed(1).padStart(8)}${row.work.toFixed(1).padStart(11)}` +
      `${delta.padStart(7)}${String(row.layers).padStart(8)}${row.fps.toFixed(1).padStart(7)}`,
  );
}
console.log('');
