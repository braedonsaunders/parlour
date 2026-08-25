/**
 * The work census: what a table *does* per burst, counted rather than timed.
 *
 * Read `scripts/census-work.js` first — it explains why counting replaced
 * timing here. In short: with builds and other agents running on the same
 * laptop, an A/B of two identical builds reported one of them 13% slower, so no
 * timing result smaller than that could be believed, and almost everything
 * worth doing is smaller than that. These counts are identical run to run.
 *
 * Alongside them, the composited layer census, which is equally exact.
 *
 *   node scripts/census-table.mjs <export-dir> [label]
 *
 * Point it at two built exports in turn and the differences are real.
 */

import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(process.cwd(), process.argv[2] ?? 'out');
const label = process.argv[3] ?? dir;
const bursts = Number(process.env.PERF_BURSTS ?? 120);
const port = Number(process.env.PERF_PORT ?? 4341);

const SCENARIOS = [
  { id: '7 seats · 18 cards', query: 'seats=7&hand=18&opponentHand=12&pickup=6&pickupEvery=4' },
  { id: '4 seats · 10 cards', query: 'seats=4&hand=10&opponentHand=7&pickup=4&pickupEvery=5' },
];

const CENSUS = readFileSync(new URL('./census-work.js', import.meta.url), 'utf8');
const serveScript = fileURLToPath(new URL('./serve-export.mjs', import.meta.url));
const webRoot = fileURLToPath(new URL('..', import.meta.url));

if (!existsSync(dir)) {
  console.error(`no such export directory: ${dir} — run \`pnpm --filter @parlour/web build\``);
  process.exit(1);
}

const server = spawn(process.execPath, [serveScript, dir, String(port)], {
  cwd: webRoot,
  stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}`;
for (let attempt = 0; ; attempt += 1) {
  if (attempt > 80) {
    server.kill();
    throw new Error(`export at ${dir} never served on ${base}`);
  }
  try {
    const response = await fetch(`${base}/dev/stress/`, { signal: AbortSignal.timeout(500) });
    if (response.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const results = [];

for (const scenario of SCENARIOS) {
  const context = await browser.newContext({
    viewport: devices['iPhone 14'].viewport,
    deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
    hasTouch: true,
  });
  await context.addInitScript(CENSUS);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);

  await page.goto(`${base}/dev/stress/?${scenario.query}&bench=${bursts}`);
  const report = page.locator('[data-testid="stress-bench"]');
  await report.waitFor({ state: 'attached', timeout: 240_000 });
  const bench = JSON.parse(await report.textContent());

  const layers = await new Promise((done) => {
    let last = [];
    let timer = null;
    session.on('LayerTree.layerTreeDidChange', ({ layers: next }) => {
      last = next ?? [];
      clearTimeout(timer);
      timer = setTimeout(() => done(last), 400);
    });
    session.send('LayerTree.enable');
    setTimeout(() => done(last), 5_000);
  });
  const nodes = await page.evaluate(() => document.querySelectorAll('*').length);

  results.push({
    scenario: scenario.id,
    work: bench.work?.perBurst ?? {},
    layers: layers.length,
    megapixels:
      Math.round(
        layers.reduce((all, l) => all + ((l.width ?? 0) * (l.height ?? 0)) / 1e6, 0) * 10,
      ) / 10,
    nodes,
    p50Ms: bench.p50Ms,
  });
  await context.close();
}

await browser.close();
server.kill();

const COLUMNS = [
  ['layoutReads', 'layout reads'],
  ['styleReads', 'style reads'],
  ['selectorScans', 'selector scans'],
  ['timers', 'timers armed'],
  ['rafs', 'rAF requests'],
  ['mutations', 'DOM mutations'],
  ['animations', 'WAAPI animations'],
];

console.log(`\n  ${label}`);
console.log(`  work per burst, counted over ${bursts} bursts (exact — load-independent)\n`);
for (const result of results) {
  console.log(`  ${result.scenario}`);
  for (const [key, name] of COLUMNS) {
    console.log(`    ${name.padEnd(18)} ${String(result.work[key] ?? 0).padStart(9)}`);
  }
  console.log(
    `    ${'composited layers'.padEnd(18)} ${String(result.layers).padStart(9)}   ${result.megapixels} Mpx`,
  );
  console.log(`    ${'DOM nodes'.padEnd(18)} ${String(result.nodes).padStart(9)}`);
  console.log(`    ${'p50 (indicative)'.padEnd(18)} ${String(result.p50Ms).padStart(9)}ms`);
  console.log('');
}

const ledgerDir = fileURLToPath(new URL('../../../output/', import.meta.url));
mkdirSync(ledgerDir, { recursive: true });
const ledger = `${ledgerDir}table-census.json`;
const history = existsSync(ledger) ? JSON.parse(readFileSync(ledger, 'utf8')) : [];
const previous = history.at(-1);
if (previous) {
  console.log(`  against "${previous.label}"`);
  console.log(`  ${'-'.repeat(72)}`);
  for (const result of results) {
    const before = previous.results.find((entry) => entry.scenario === result.scenario);
    if (!before) continue;
    const changes = [];
    for (const [key, name] of [...COLUMNS, ['layers', 'layers'], ['nodes', 'nodes']]) {
      const was = key in result.work ? before.work[key] : before[key];
      const now = key in result.work ? result.work[key] : result[key];
      if (was === undefined || now === undefined || was === now) continue;
      const pct =
        was === 0 ? '' : ` (${now > was ? '+' : ''}${(((now - was) / was) * 100).toFixed(0)}%)`;
      changes.push(`${name} ${was}→${now}${pct}`);
    }
    console.log(`  ${result.scenario}: ${changes.length ? changes.join(', ') : 'no change'}`);
  }
  console.log('');
}
history.push({ label, bursts, results });
writeFileSync(ledger, `${JSON.stringify(history, null, 2)}\n`);
