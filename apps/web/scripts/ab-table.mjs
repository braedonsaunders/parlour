/**
 * Weighs two builds of the table against each other, interleaved.
 *
 * Measuring a build, changing it, and measuring again does not work on a laptop
 * that is also running the builds: the same unchanged build measured 22.6ms one
 * hour and 26.6ms the next, and repeats of a single build disagreed by twenty
 * per cent. Every change smaller than that drift is unreadable, and several
 * "wins" and "regressions" measured earlier in this work were nothing but the
 * machine's mood.
 *
 * A calibration loop was not enough, because a tight arithmetic loop does not
 * share the bottlenecks that matter — allocation, garbage collection, the
 * DOM — so it drifts differently from the thing it is meant to normalise.
 *
 * What does work is pairing. Both builds are served at once and measured
 * alternately, A B A B, in the same browser on the same core within seconds of
 * each other. Whatever the machine is doing, it is doing it to both. The result
 * is reported as a paired difference over the rounds, with the spread of those
 * rounds alongside it, so a difference smaller than the noise is visible as
 * such rather than being reported as a win.
 *
 *   node scripts/ab-table.mjs <a-dir> <b-dir> [rounds] [cpu-throttle]
 *
 * where each dir is a built static export (an `out/` produced by `next build`).
 */

import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , aArg, bArg, roundsArg, throttleArg] = process.argv;
if (!aArg || !bArg) {
  console.error('usage: node scripts/ab-table.mjs <a-dir> <b-dir> [rounds] [cpu-throttle]');
  process.exit(1);
}
// Resolved against the caller's directory, not the server's: the two exports
// being compared normally live in two different worktrees.
const aDir = resolve(process.cwd(), aArg);
const bDir = resolve(process.cwd(), bArg);
const rounds = Number(roundsArg ?? 6);
const throttle = Number(throttleArg ?? 4);
const bursts = Number(process.env.PERF_BURSTS ?? 200);

const SCENARIOS = [
  { id: '7 seats · 18 cards', query: 'seats=7&hand=18&opponentHand=12&pickup=6&pickupEvery=4' },
  { id: '4 seats · 10 cards', query: 'seats=4&hand=10&opponentHand=7&pickup=4&pickupEvery=5' },
];

const serveScript = fileURLToPath(new URL('./serve-export.mjs', import.meta.url));
const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function serve(dir, port) {
  if (!existsSync(dir)) throw new Error(`no such export directory: ${dir}`);
  const child = spawn(process.execPath, [serveScript, dir, String(port)], {
    cwd: webRoot,
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/dev/stress/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { base, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`export at ${dir} never served on ${base}`);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const a = await serve(aDir, 4331);
const b = await serve(bDir, 4332);
const browser = await chromium.launch();

/** One measurement: load the bench, wait for its verdict, read it back. */
async function measure(base, scenario) {
  const context = await browser.newContext({
    viewport: devices['iPhone 14'].viewport,
    deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
    hasTouch: true,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto(`${base}/dev/stress/?${scenario.query}&bench=${bursts}`);
  const report = page.locator('[data-testid="stress-bench"]');
  await report.waitFor({ state: 'attached', timeout: 180_000 });
  const result = JSON.parse(await report.textContent());
  const layers = await new Promise((resolve) => {
    let last = [];
    let timer = null;
    session.on('LayerTree.layerTreeDidChange', ({ layers: next }) => {
      last = next ?? [];
      clearTimeout(timer);
      timer = setTimeout(() => resolve(last), 400);
    });
    session.send('LayerTree.enable');
    setTimeout(() => resolve(last), 5_000);
  });
  result.layers = layers.length;
  result.megapixels = layers.reduce((all, l) => all + ((l.width ?? 0) * (l.height ?? 0)) / 1e6, 0);
  await context.close();
  return result;
}

const table = [];
for (const scenario of SCENARIOS) {
  const pairs = [];
  for (let round = 0; round < rounds; round += 1) {
    // Order alternates so neither build always gets the colder browser.
    const first = round % 2 === 0 ? a : b;
    const second = round % 2 === 0 ? b : a;
    const firstResult = await measure(first.base, scenario);
    const secondResult = await measure(second.base, scenario);
    const aResult = round % 2 === 0 ? firstResult : secondResult;
    const bResult = round % 2 === 0 ? secondResult : firstResult;
    pairs.push({
      a: aResult.p50Ms,
      b: bResult.p50Ms,
      ratio: bResult.p50Ms / aResult.p50Ms,
      aLayers: aResult.layers,
      bLayers: bResult.layers,
    });
    process.stdout.write(
      `  ${scenario.id}  round ${round + 1}/${rounds}: ` +
        `${aResult.p50Ms.toFixed(1)}ms → ${bResult.p50Ms.toFixed(1)}ms ` +
        `(${(((bResult.p50Ms - aResult.p50Ms) / aResult.p50Ms) * 100).toFixed(1)}%)\n`,
    );
  }
  table.push({ scenario: scenario.id, pairs });
}

await browser.close();
a.stop();
b.stop();

console.log(`\n  A = ${aDir}\n  B = ${bDir}`);
console.log(`  ${rounds} interleaved rounds × ${bursts} bursts · ${throttle}x CPU throttle\n`);
console.log('  scenario              A p50    B p50   change   worst   best   layers');
console.log(`  ${'-'.repeat(78)}`);
for (const { scenario, pairs } of table) {
  const ratios = pairs.map((pair) => pair.ratio);
  const change = (median(ratios) - 1) * 100;
  const worst = (Math.max(...ratios) - 1) * 100;
  const best = (Math.min(...ratios) - 1) * 100;
  const aMs = median(pairs.map((pair) => pair.a));
  const bMs = median(pairs.map((pair) => pair.b));
  const layers = `${median(pairs.map((p) => p.aLayers))}→${median(pairs.map((p) => p.bLayers))}`;
  console.log(
    `  ${scenario.padEnd(20)}` +
      `${aMs.toFixed(1).padStart(7)}ms${bMs.toFixed(1).padStart(8)}ms` +
      `${`${change >= 0 ? '+' : ''}${change.toFixed(1)}%`.padStart(9)}` +
      `${`${worst >= 0 ? '+' : ''}${worst.toFixed(0)}%`.padStart(8)}` +
      `${`${best >= 0 ? '+' : ''}${best.toFixed(0)}%`.padStart(7)}` +
      `${layers.padStart(10)}`,
  );
}
// Every round is a paired comparison, so "how many rounds agreed" is the honest
// confidence statement — a change that wins four rounds out of six has not been
// shown to do anything.
for (const { scenario, pairs } of table) {
  const wins = pairs.filter((pair) => pair.ratio < 1).length;
  console.log(`  ${scenario}: B was faster in ${wins} of ${pairs.length} rounds`);
}
console.log('');
