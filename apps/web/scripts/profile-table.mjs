/**
 * Where a stressed table spends its main thread.
 *
 * The frame-budget suite says *how bad* it is; this says *what* is doing it.
 * Runs the stress rig under a CPU-throttled Chromium, takes a V8 CPU profile,
 * and prints self-time by function and by file. Chromium-only by necessity —
 * WebKit exposes no sampling profiler over the automation protocol — so read it
 * as "which of our code is hot", not as an iOS measurement.
 *
 *   node scripts/profile-table.mjs [url-path] [seconds] [cpu-throttle]
 */

import { chromium, devices } from '@playwright/test';

const path =
  process.argv[2] ?? '/dev/stress/?seats=7&hand=18&opponentHand=12&pickup=6&pickupEvery=4&bench=60';
const seconds = Number(process.argv[3] ?? 8);
const throttle = Number(process.argv[4] ?? 4);
const base = process.env.PERF_BASE ?? 'http://127.0.0.1:4321';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: devices['iPhone 14'].viewport,
  deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
  hasTouch: true,
});
const page = await context.newPage();
const session = await context.newCDPSession(page);
if (throttle > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });

// In bench mode the profile is taken over the burst loop itself, which is the
// whole point: with the compositor out of the loop, what is left in the profile
// is the table's own work rather than eight seconds of `(program)`.
const benching = path.includes('bench=');
await session.send('Profiler.enable');
await session.send('Profiler.setSamplingInterval', { interval: 100 });

if (benching) {
  await session.send('Profiler.start');
  await page.goto(`${base}${path}`);
  await page
    .locator('[data-testid="stress-bench"]')
    .waitFor({ state: 'attached', timeout: 180_000 });
} else {
  await page.goto(`${base}${path}`);
  await page
    .locator('[role="list"][data-zone] [role="listitem"]')
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2_500);
  await session.send('Profiler.start');
  await page.waitForTimeout(seconds * 1_000);
}
const { profile } = await session.send('Profiler.stop');

// A V8 profile is a call tree plus a sample stream. Self time is the honest
// measure for "what should I change": inclusive time just re-reports React.
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const selfTime = new Map();
const total = profile.endTime - profile.startTime;
for (let index = 0; index < profile.samples.length; index += 1) {
  const delta = profile.timeDeltas[index] ?? 0;
  const node = byId.get(profile.samples[index]);
  if (!node) continue;
  selfTime.set(node.id, (selfTime.get(node.id) ?? 0) + delta);
}

/**
 * A production build is one line of minified JavaScript per chunk, so a
 * function name and a line number identify nothing. The column does — fetching
 * the chunk and quoting the source around it turns `(anonymous) — chunk.js:1`
 * into something recognisable as ours.
 */
const sources = new Map();
async function snippetAt(url, column) {
  if (!url || column === undefined) return '';
  if (!sources.has(url)) {
    sources.set(
      url,
      await fetch(url)
        .then((response) => response.text())
        .catch(() => ''),
    );
  }
  const source = sources.get(url);
  if (!source) return '';
  return source
    .slice(Math.max(0, column - 1), column + 90)
    .replace(/\s+/g, ' ')
    .trim();
}

const label = (node) => {
  const { functionName, url, lineNumber } = node.callFrame;
  const file = url ? url.replace(base, '').split('?')[0] : '(native)';
  return `${functionName || '(anonymous)'} — ${file}:${lineNumber + 1}`;
};

const rows = [...selfTime.entries()]
  .map(([id, us]) => ({ node: byId.get(id), ms: us / 1000 }))
  .filter((row) => row.node && row.ms > 0)
  .sort((left, right) => right.ms - left.ms);

const measured = rows.reduce((all, row) => all + row.ms, 0);
console.log(`\n  ${path}`);
console.log(
  `  ${(total / 1000).toFixed(0)}ms wall · ${measured.toFixed(0)}ms sampled · ${throttle}x CPU throttle\n`,
);
console.log('  self ms   share  function');
console.log(`  ${'-'.repeat(96)}`);
for (const row of rows.slice(0, 24)) {
  const share = `${((row.ms / measured) * 100).toFixed(1)}%`;
  console.log(`  ${row.ms.toFixed(1).padStart(7)}  ${share.padStart(6)}  ${label(row.node)}`);
  const snippet = await snippetAt(row.node.callFrame.url, row.node.callFrame.columnNumber);
  if (snippet) console.log(`                          ${snippet}`);
}

/**
 * Self time says which line is hot; inclusive time says which *decision* is
 * expensive. A hook that spends all its time inside React or GSAP has no self
 * time at all and is invisible above, which is exactly how the most expensive
 * thing on the table stayed hidden for three rounds of this.
 */
const parents = new Map();
for (const node of profile.nodes) {
  for (const child of node.children ?? []) parents.set(child, node.id);
}
const inclusive = new Map();
for (const [id, us] of selfTime) {
  let current = id;
  const seen = new Set();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    inclusive.set(current, (inclusive.get(current) ?? 0) + us / 1000);
    current = parents.get(current);
  }
}

console.log('\n  incl ms   share  function (inclusive of everything it calls)');
console.log(`  ${'-'.repeat(96)}`);
// React's own frames are excluded by default: a call tree through `flushSync`
// is forty frames of scheduler before it reaches anything we wrote, and they
// all report roughly the same total. PERF_ALL_FRAMES keeps them.
const ours = (node) => {
  if (process.env.PERF_ALL_FRAMES) return true;
  const url = node.callFrame.url ?? '';
  return url !== '' && !/0-h_j2_nobdzu|turbopack-/.test(url);
};
const deep = [...inclusive.entries()]
  .map(([id, ms]) => ({ node: byId.get(id), ms }))
  .filter((row) => row.node && row.ms > measured * 0.005 && ours(row.node))
  .sort((left, right) => right.ms - left.ms)
  .slice(0, 20);
for (const row of deep) {
  const share = `${((row.ms / measured) * 100).toFixed(1)}%`;
  console.log(`  ${row.ms.toFixed(1).padStart(7)}  ${share.padStart(6)}  ${label(row.node)}`);
  const snippet = await snippetAt(row.node.callFrame.url, row.node.callFrame.columnNumber);
  if (snippet) console.log(`                          ${snippet.slice(0, 88)}`);
}

/**
 * `PERF_UNDER=<snippet>` opens one frame up: it finds every call-tree node whose
 * minified source starts with that text and reports what its children cost.
 * This is how "the fx effect is 46% of a burst" becomes a list of things to
 * change inside the fx effect.
 */
if (process.env.PERF_UNDER) {
  const needle = process.env.PERF_UNDER;
  const children = new Map();
  let own = 0;
  let total = 0;
  for (const node of profile.nodes) {
    const snippet = await snippetAt(node.callFrame.url, node.callFrame.columnNumber);
    if (!snippet.startsWith(needle)) continue;
    total += inclusive.get(node.id) ?? 0;
    own += (selfTime.get(node.id) ?? 0) / 1000;
    for (const childId of node.children ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      const key = `${child.callFrame.functionName || '(anonymous)'}@${child.callFrame.columnNumber}`;
      const entry = children.get(key) ?? { ms: 0, node: child };
      entry.ms += inclusive.get(childId) ?? 0;
      children.set(key, entry);
    }
  }
  console.log(
    `\n  inside "${needle}…"  —  ${total.toFixed(0)}ms inclusive, ${own.toFixed(0)}ms its own code`,
  );
  console.log(`  ${'-'.repeat(96)}`);
  for (const [, entry] of [...children.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) {
    console.log(
      `  ${entry.ms.toFixed(1).padStart(7)}  ${entry.node.callFrame.functionName || '(anonymous)'}`,
    );
    const snippet = await snippetAt(entry.node.callFrame.url, entry.node.callFrame.columnNumber);
    if (snippet) console.log(`            ${snippet.slice(0, 88)}`);
  }
}

const byFile = new Map();
for (const row of rows) {
  const url = row.node.callFrame.url || '(native)';
  const file = url.replace(base, '').split('?')[0] || '(native)';
  byFile.set(file, (byFile.get(file) ?? 0) + row.ms);
}
console.log('\n  self ms   share  file');
console.log(`  ${'-'.repeat(96)}`);
for (const [file, ms] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(
    `  ${ms.toFixed(1).padStart(7)}  ${`${((ms / measured) * 100).toFixed(1)}%`.padStart(6)}  ${file}`,
  );
}
console.log('');

await browser.close();
