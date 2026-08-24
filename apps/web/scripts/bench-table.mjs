/**
 * The number the optimisation work is steered by.
 *
 * Everything else tried first was too noisy to act on. Frame rate in a headless
 * browser is paced by a compositor wait that a two-seat idle table pays as much
 * of as a seven-seat one, so ablating an effect routinely measured *slower*
 * than leaving it in. Totals-per-second reward a faster page with a worse
 * score. Per-frame normalisation breaks on any fixed-rate animation.
 *
 * So this measures a fixed amount of work rather than a fixed amount of time.
 * The harness runs N bursts back to back, each flushed synchronously and
 * followed by a forced layout, and times each one. What comes back is the cost
 * of turning new game state into a laid-out table — React render, style recalc,
 * layout — with the compositor out of the loop. It varies by a couple of
 * percent between runs of the same build.
 *
 * Alongside it, the composited layer count: exact, identical every run, and the
 * best available proxy for the raster and memory pressure that a phone feels
 * and a laptop does not.
 *
 *   node scripts/bench-table.mjs [label] [repeats] [cpu-throttle]
 */

import { chromium, devices } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveExport, BASE } from './perf-server.mjs';

const label = process.argv[2] ?? process.env.PERF_LABEL ?? 'run';
const repeats = Number(process.argv[3] ?? 3);
const throttle = Number(process.argv[4] ?? 4);
const bursts = Number(process.env.PERF_BURSTS ?? 60);

/** The scenarios every measurement covers, so a win in one is not a loss elsewhere. */
const SCENARIOS = [
  {
    id: '7 seats · 18 cards',
    query: 'seats=7&hand=18&opponentHand=12&pickup=6&pickupEvery=4',
  },
  {
    id: '4 seats · 10 cards',
    query: 'seats=4&hand=10&opponentHand=7&pickup=4&pickupEvery=5',
  },
  {
    id: '2 seats · 5 cards',
    query: 'seats=2&hand=5&opponentHand=5&pickup=2&pickupEvery=6',
  },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const spread = (values) => Math.max(...values) - Math.min(...values);

const stopServer = await serveExport();
const browser = await chromium.launch();
const results = [];

for (const scenario of SCENARIOS) {
  const runs = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const context = await browser.newContext({
      viewport: devices['iPhone 14'].viewport,
      deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
      hasTouch: true,
    });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await page.goto(`${BASE}/dev/stress/?${scenario.query}&bench=${bursts}`);
    const report = page.locator('[data-testid="stress-bench"]');
    await report.waitFor({ state: 'attached', timeout: 120_000 });
    const bench = JSON.parse(await report.textContent());

    // Layers are read from the settled table the bench leaves behind — same
    // markup a player would be looking at mid-hand.
    const layers = await new Promise((resolve) => {
      let last = [];
      let timer = null;
      session.on('LayerTree.layerTreeDidChange', ({ layers: next }) => {
        last = next ?? [];
        clearTimeout(timer);
        timer = setTimeout(() => resolve(last), 500);
      });
      session.send('LayerTree.enable');
      setTimeout(() => resolve(last), 6_000);
    });
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length);

    runs.push({
      ...bench,
      layers: layers.length,
      megapixels: layers.reduce((all, l) => all + ((l.width ?? 0) * (l.height ?? 0)) / 1e6, 0),
      nodes,
    });
    await context.close();
  }

  const at = (key) => median(runs.map((run) => run[key]));
  results.push({
    scenario: scenario.id,
    meanMs: at('meanMs'),
    p50Ms: at('p50Ms'),
    p95Ms: at('p95Ms'),
    maxMs: at('maxMs'),
    layers: at('layers'),
    megapixels: at('megapixels'),
    nodes: at('nodes'),
    jitter: spread(runs.map((run) => run.meanMs)),
  });
}

await browser.close();
stopServer();

const row = { label, throttle, bursts, repeats, scenarios: results };

console.log(`\n  ${label} · ${bursts} bursts × ${repeats} runs · ${throttle}x CPU throttle`);
console.log('  milliseconds to turn one burst of game state into a laid-out table\n');
console.log('  scenario              mean     p50     p95     max   ±run   layers    Mpx   nodes');
console.log(`  ${'-'.repeat(82)}`);
for (const result of results) {
  console.log(
    `  ${result.scenario.padEnd(20)}` +
      `${result.meanMs.toFixed(2).padStart(6)}${result.p50Ms.toFixed(2).padStart(8)}` +
      `${result.p95Ms.toFixed(2).padStart(8)}${result.maxMs.toFixed(2).padStart(8)}` +
      `${result.jitter.toFixed(2).padStart(7)}${String(result.layers).padStart(9)}` +
      `${result.megapixels.toFixed(1).padStart(7)}${String(result.nodes).padStart(8)}`,
  );
}

const ledgerDir = fileURLToPath(new URL('../../../output/', import.meta.url));
mkdirSync(ledgerDir, { recursive: true });
const ledger = `${ledgerDir}table-bench.json`;
const history = existsSync(ledger) ? JSON.parse(readFileSync(ledger, 'utf8')) : [];

const previous = history.at(-1);
if (previous) {
  console.log(`\n  against "${previous.label}"`);
  console.log(`  ${'-'.repeat(52)}`);
  for (const result of results) {
    const before = previous.scenarios.find((entry) => entry.scenario === result.scenario);
    if (!before) continue;
    const change = ((result.meanMs - before.meanMs) / before.meanMs) * 100;
    const layerChange = result.layers - before.layers;
    console.log(
      `  ${result.scenario.padEnd(20)} ${before.meanMs.toFixed(2)}ms → ${result.meanMs.toFixed(2)}ms` +
        `  ${change >= 0 ? '+' : ''}${change.toFixed(1)}%` +
        `   layers ${before.layers} → ${result.layers} (${layerChange >= 0 ? '+' : ''}${layerChange})`,
    );
  }
}
console.log('');

history.push(row);
writeFileSync(ledger, `${JSON.stringify(history, null, 2)}\n`);
