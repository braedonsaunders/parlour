/**
 * Plays a full solo Wild match in an emulated iPhone 16 Pro Max and reports
 * real main-thread numbers: long animation frames (with script attribution),
 * long tasks, frame intervals, layout/style counts, DOM growth, and a
 * symbolicated CPU profile.
 *
 * Also answers the podium question: it records every document-level navigation,
 * so a soft route change and a full reload are told apart rather than guessed.
 *
 *   node scripts/perf/wild-run.mjs --label=baseline --cpu=4 --profile
 */
import { chromium } from '/Users/braedonsaunders/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = arg('url', 'http://127.0.0.1:4321');
const LABEL = arg('label', 'run');
const CPU = Number(arg('cpu', '4'));
const SEATS = arg('seats', '3');
const MAX_MS = Number(arg('maxms', '360000'));
const MATCHES = Number(arg('matches', '1'));
const IDLE_MS = Number(arg('idle', '0'));
const OUT = 'scripts/perf/out';
const CHROME =
  '/Users/braedonsaunders/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

await mkdir(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * In-page instrumentation. Installed before any app script runs.
 * ------------------------------------------------------------------ */
const INSTRUMENT = () => {
  const boots = Number(sessionStorage.getItem('__perf_boots') ?? '0') + 1;
  sessionStorage.setItem('__perf_boots', String(boots));

  const perf = {
    boots,
    navType: performance.getEntriesByType('navigation')[0]?.type ?? 'unknown',
    commits: 0,
    frames: [],
    longTasks: [],
    loaf: [],
    marks: [],
  };
  window.__perf = perf;

  // A minimal DevTools hook so React reports its commits. React wraps the
  // injection in try/catch, so a missing method degrades to "no counts"
  // rather than breaking the app.
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const noop = () => {};
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      isDisabled: false,
      inject(renderer) {
        const id = this.renderers.size + 1;
        this.renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot() {
        perf.commits += 1;
      },
      onPostCommitFiberRoot: noop,
      onCommitFiberUnmount: noop,
      setStrictMode: noop,
      getFiberRoots: () => new Set(),
      checkDCE: noop,
      on: noop,
      off: noop,
      sub: () => noop,
      emit: noop,
    };
  }

  let last = performance.now();
  const tick = (now) => {
    perf.frames.push(Math.round((now - last) * 100) / 100);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.longTasks.push({ start: Math.round(entry.startTime), ms: Math.round(entry.duration) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* unsupported */
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        perf.loaf.push({
          start: Math.round(entry.startTime),
          ms: Math.round(entry.duration),
          blocking: Math.round(entry.blockingDuration),
          // Time from renderStart to the end covers style, layout and paint.
          render: Math.round(Math.max(0, entry.startTime + entry.duration - entry.renderStart)),
          styleAndLayout: Math.round(
            Math.max(0, entry.startTime + entry.duration - entry.styleAndLayoutStart),
          ),
          scripts: (entry.scripts ?? []).map((script) => ({
            ms: Math.round(script.duration),
            invoker: script.invoker,
            type: script.invokerType,
            url: script.sourceURL,
            fn: script.sourceFunctionName,
            pos: script.sourceCharPosition,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* unsupported */
  }

  window.__perfMark = (name) => {
    perf.marks.push({ name, at: Math.round(performance.now()), commits: perf.commits });
  };
};

/* ------------------------------------------------------------------ *
 * Source-map symbolication for the CPU profile.
 * ------------------------------------------------------------------ */
const mapCache = new Map();
async function loadMap(url) {
  if (mapCache.has(url)) return mapCache.get(url);
  let consumer = null;
  try {
    const path = join('apps/web/out', new URL(url).pathname);
    const payload = JSON.parse(await readFile(`${path}.map`, 'utf8'));
    consumer = new SourceMap(payload);
  } catch {
    consumer = null;
  }
  mapCache.set(url, consumer);
  return consumer;
}

async function symbolicate(frame) {
  if (!frame.url || !frame.url.startsWith('http')) return null;
  const consumer = await loadMap(frame.url);
  if (!consumer) return null;
  try {
    const entry = consumer.findEntry(frame.lineNumber, frame.columnNumber);
    if (!entry?.originalSource) return null;
    return {
      source: entry.originalSource.replace(/^.*?\/(apps|packages|node_modules)\//, '$1/'),
      line: entry.originalLine + 1,
      name: entry.name ?? null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
});
await context.addInitScript(INSTRUMENT);

const page = await context.newPage();
const documentLoads = [];
page.on('request', (request) => {
  if (request.resourceType() === 'document') {
    documentLoads.push({ url: request.url(), at: Date.now() });
  }
});
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`));

const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

const metricSamples = [];
const sampleMetrics = async (tag) => {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const row = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
    const commits = await page.evaluate(() => window.__perf?.commits ?? 0).catch(() => 0);
    metricSamples.push({
      tag,
      at: Date.now(),
      commits,
      nodes: row.Nodes,
      listeners: row.JSEventListeners,
      heapMb: Math.round((row.JSHeapUsedSize / 1048576) * 10) / 10,
      layouts: row.LayoutCount,
      recalcs: row.RecalcStyleCount,
      scriptMs: Math.round(row.ScriptDuration * 1000),
      layoutMs: Math.round(row.LayoutDuration * 1000),
      recalcMs: Math.round(row.RecalcStyleDuration * 1000),
      taskMs: Math.round(row.TaskDuration * 1000),
    });
  } catch {
    /* page navigating */
  }
};

const dismissSplash = async () => {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    if ((await page.getByTestId('splash-screen').count()) === 0) break;
    await page.waitForTimeout(400);
    const button = page.getByTestId('splash-screen-dismiss');
    if (await button.count()) await button.click({ force: true, timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
};

console.log(`[perf] ${LABEL}: booting ${BASE} (cpu x${CPU}, seats ${SEATS})`);
await page.goto(BASE, { waitUntil: 'load' });
await dismissSplash();
await page.goto(`${BASE}/wild/`, { waitUntil: 'load' });
await dismissSplash();

// Seat count: you + 2 bots, matching the reported session.
const seatGroup = page.getByRole('group', { name: 'Seats' });
await seatGroup
  .getByRole('button', { name: SEATS, exact: true })
  .click({ timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(300);

const visible = async (testId) => {
  const locator = page.getByTestId(testId);
  return (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
};

let moves = 0;
let lastCardCalls = 0;
let sawLastCardButton = false;
let lastCardButtonBox = null;
let steps = 0;
let idle = null;
let runningAnimations = [];

async function playMatch(matchIndex) {
  const matchStart = Date.now();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-table-screen]')), {
    timeout: 20000,
  });
  await page.evaluate((index) => window.__perfMark?.(`table-${index}`), matchIndex);
  await page.waitForTimeout(1500);
  await sampleMetrics(`deal-${matchIndex}`);

  // Idle cost: a dealt table with nobody acting. This is the floor the whole
  // game sits on, so it matters more than any single animation.
  if (IDLE_MS > 0 && matchIndex === 0) {
    await sampleMetrics('idle-start');
    // Every running animation is a style recalculation per frame, so name them
    // rather than guessing which ones are still burning the idle table.
    runningAnimations = await page
      .evaluate(() =>
        document.getAnimations().map((animation) => {
          const target = animation.effect?.target;
          return {
            name: animation.animationName ?? animation.transitionProperty ?? 'unknown',
            state: animation.playState,
            className:
              typeof target?.className === 'string'
                ? target.className.slice(0, 70)
                : (target?.tagName ?? '?'),
          };
        }),
      )
      .catch(() => []);
    await page.waitForTimeout(IDLE_MS);
    await sampleMetrics('idle-end');
    const [before, after] = [
      metricSamples.at(-2),
      metricSamples.at(-1),
    ];
    const seconds = (after.at - before.at) / 1000;
    idle = {
      seconds: Math.round(seconds * 10) / 10,
      commitsPerSecond: Math.round(((after.commits - before.commits) / seconds) * 10) / 10,
      recalcsPerSecond: Math.round(((after.recalcs - before.recalcs) / seconds) * 10) / 10,
      layoutsPerSecond: Math.round(((after.layouts - before.layouts) / seconds) * 10) / 10,
      scriptMsPerSecond: Math.round(((after.scriptMs - before.scriptMs) / seconds) * 10) / 10,
      taskMsPerSecond: Math.round(((after.taskMs - before.taskMs) / seconds) * 10) / 10,
      recalcMsPerSecond: Math.round(((after.recalcMs - before.recalcMs) / seconds) * 10) / 10,
      layoutMsPerSecond: Math.round(((after.layoutMs - before.layoutMs) / seconds) * 10) / 10,
    };
  }

  while (Date.now() - matchStart < MAX_MS) {
  steps += 1;
  if (page.url().includes('/match-end')) break;

  // The last-card affordance: record where it actually lands on the phone
  // the first time it appears, then use it.
  if (await visible('call-last-card')) {
    sawLastCardButton = true;
    if (!lastCardButtonBox) {
      lastCardButtonBox = await page
        .getByTestId('call-last-card')
        .boundingBox()
        .catch(() => null);
      const rail = await page
        .locator('[data-zone^="hand:"]')
        .first()
        .boundingBox()
        .catch(() => null);
      lastCardButtonBox = { button: lastCardButtonBox, handRail: rail };
      await page.screenshot({ path: `${OUT}/${LABEL}-last-card.png` }).catch(() => {});
    }
    await page.getByTestId('call-last-card').click({ timeout: 2000 }).catch(() => {});
    lastCardCalls += 1;
    await page.waitForTimeout(120);
    continue;
  }

  if (await visible('color-wheel')) {
    await page
      .locator('[data-wedge="0"]')
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    continue;
  }

  if (await visible('swap-chooser')) {
    await page
      .getByTestId('swap-chooser')
      .getByRole('button')
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    continue;
  }

  if (await visible('challenge-prompt')) {
    await page.getByTestId('accept-draw-four').click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    continue;
  }

  const jumpPass = page.getByRole('alertdialog').getByRole('button', { name: 'Pass' });
  if ((await jumpPass.count()) && (await jumpPass.first().isVisible().catch(() => false))) {
    await jumpPass.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    continue;
  }

  const playable = page.locator('[data-hand-card][data-playable="true"] button:not([disabled])');
  if (await playable.count()) {
    await playable
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    moves += 1;
    if (moves % 5 === 0) await sampleMetrics(`move-${moves}`);
    await page.waitForTimeout(260);
    continue;
  }

  if (await visible('pass-drawn-card')) {
    await page.getByTestId('pass-drawn-card').click({ timeout: 2000 }).catch(() => {});
    moves += 1;
    await page.waitForTimeout(260);
    continue;
  }

  const stock = page.locator('[data-zone="stock"]:not([disabled])');
  if ((await stock.count()) && (await stock.first().isEnabled().catch(() => false))) {
    await stock
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    moves += 1;
    await page.waitForTimeout(320);
    continue;
  }

  await page.waitForTimeout(260);
  if (steps % 20 === 0) await sampleMetrics(`wait-${steps}`);
  }
  await page.evaluate((index) => window.__perfMark?.(`over-${index}`), matchIndex).catch(() => {});
}

if (flag('profile')) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}

const startedAt = Date.now();
const matchOutcomes = [];
await page.getByTestId('deal-me-in').click();

for (let matchIndex = 0; matchIndex < MATCHES; matchIndex += 1) {
  if (matchIndex > 0) {
    const again = page.getByTestId('play-again');
    if (!(await again.count())) break;
    await again.click({ timeout: 5000 }).catch(() => {});
  }
  await playMatch(matchIndex);

  // The 900ms hand-off to the podium, then what actually rendered.
  const documentsBefore = documentLoads.length;
  await page.waitForTimeout(3500);
  matchOutcomes.push({
    match: matchIndex,
    url: page.url(),
    reachedMatchEnd: page.url().includes('match-end'),
    emptyState: (await page.getByText('No match on record').count()) > 0,
    podiumRendered: (await page.getByTestId('play-again').count()) > 0,
    documentLoadsDuringHandoff: documentLoads.length - documentsBefore,
  });
  await sampleMetrics(`podium-${matchIndex}`);
}

const gameplayMs = Date.now() - startedAt;

let profileReport = null;
if (flag('profile')) {
  const { profile } = await cdp.send('Profiler.stop').catch(() => ({ profile: null }));
  if (profile) {
    const selfTime = new Map();
    const total = profile.timeDeltas.reduce((sum, delta) => sum + Math.max(0, delta), 0);
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    for (let index = 0; index < profile.samples.length; index += 1) {
      const id = profile.samples[index];
      const delta = Math.max(0, profile.timeDeltas[index] ?? 0);
      selfTime.set(id, (selfTime.get(id) ?? 0) + delta);
    }
    const ranked = [...selfTime.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 40)
      .map(([id, micros]) => ({ node: byId.get(id), micros }));
    profileReport = { totalMs: Math.round(total / 1000), frames: [] };
    for (const { node, micros } of ranked) {
      if (!node) continue;
      const frame = node.callFrame;
      const origin = await symbolicate(frame);
      profileReport.frames.push({
        ms: Math.round(micros / 1000),
        pct: Math.round((micros / total) * 1000) / 10,
        fn: frame.functionName || '(anonymous)',
        url: frame.url?.replace(BASE, '') ?? '',
        origin,
      });
    }
  }
}

await page.screenshot({ path: `${OUT}/${LABEL}-final.png` }).catch(() => {});
await sampleMetrics('final');

const raw = await page
  .evaluate(() => ({
    frames: window.__perf.frames,
    longTasks: window.__perf.longTasks,
    loaf: window.__perf.loaf,
    commits: window.__perf.commits,
    marks: window.__perf.marks,
  }))
  .catch(() => ({ frames: [], longTasks: [], loaf: [], commits: 0, marks: [] }));

// Does the podium survive a document reload? That is exactly what a hard
// navigation, an iOS tab discard or a service-worker refresh looks like to
// this page, and it is the difference between "state was never set" and
// "state was set and then thrown away". Run last: the reload resets __perf.
let reloadSurvival = null;
if (page.url().includes('match-end')) {
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1500);
  reloadSurvival = {
    emptyState: (await page.getByText('No match on record').count()) > 0,
    podiumRendered: (await page.getByTestId('play-again').count()) > 0,
  };
  await page.screenshot({ path: `${OUT}/${LABEL}-after-reload.png` }).catch(() => {});
}

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const frames = raw.frames.filter((value) => value > 0 && value < 2000);
const loafBlocking = raw.loaf.map((entry) => entry.blocking);

// Which script sites show up most across long animation frames.
const attribution = new Map();
for (const entry of raw.loaf) {
  for (const script of entry.scripts) {
    const key = `${script.type ?? '?'} ${script.invoker ?? '?'}`;
    const row = attribution.get(key) ?? { key, count: 0, ms: 0 };
    row.count += 1;
    row.ms += script.ms;
    attribution.set(key, row);
  }
}

const report = {
  label: LABEL,
  base: BASE,
  cpuThrottle: CPU,
  seats: Number(SEATS),
  gameplayMs,
  moves,
  reactCommits: raw.commits,
  commitsPerSecond: Math.round((raw.commits / (gameplayMs / 1000)) * 10) / 10,
  frames: {
    count: frames.length,
    medianMs: percentile(frames, 50),
    p95Ms: percentile(frames, 95),
    p99Ms: percentile(frames, 99),
    worstMs: Math.max(0, ...frames),
    over33ms: frames.filter((value) => value > 33).length,
    over100ms: frames.filter((value) => value > 100).length,
    droppedPct: Math.round((frames.filter((value) => value > 20).length / frames.length) * 1000) / 10,
  },
  longTasks: {
    count: raw.longTasks.length,
    totalMs: raw.longTasks.reduce((sum, task) => sum + task.ms, 0),
    worstMs: Math.max(0, ...raw.longTasks.map((task) => task.ms)),
  },
  loaf: {
    count: raw.loaf.length,
    totalBlockingMs: loafBlocking.reduce((sum, value) => sum + value, 0),
    p95BlockingMs: percentile(loafBlocking, 95),
    worstMs: Math.max(0, ...raw.loaf.map((entry) => entry.ms)),
    worstStyleAndLayoutMs: Math.max(0, ...raw.loaf.map((entry) => entry.styleAndLayout)),
    topAttribution: [...attribution.values()].sort((a, b) => b.ms - a.ms).slice(0, 10),
  },
  idle,
  runningAnimations,
  lastCard: { seen: sawLastCardButton, calls: lastCardCalls, geometry: lastCardButtonBox },
  matches: matchOutcomes,
  reloadSurvival,
  documentLoads,
  consoleErrors: consoleErrors.slice(0, 20),
  metricSamples,
  profile: profileReport,
};

await writeFile(`${OUT}/${LABEL}.json`, JSON.stringify(report, null, 2));
await browser.close();

console.log(`\n=== ${LABEL} (cpu x${CPU}, ${Math.round(gameplayMs / 1000)}s, ${moves} moves) ===`);
console.log(
  `frames    median ${report.frames.medianMs}ms  p95 ${report.frames.p95Ms}ms  p99 ${report.frames.p99Ms}ms  worst ${report.frames.worstMs}ms`,
);
console.log(
  `          >33ms ${report.frames.over33ms}  >100ms ${report.frames.over100ms}  janky ${report.frames.droppedPct}%`,
);
console.log(
  `loaf      ${report.loaf.count} frames  blocking ${report.loaf.totalBlockingMs}ms  p95 ${report.loaf.p95BlockingMs}ms  worst ${report.loaf.worstMs}ms`,
);
console.log(
  `longtask  ${report.longTasks.count}  total ${report.longTasks.totalMs}ms  worst ${report.longTasks.worstMs}ms`,
);
console.log(`react     ${report.reactCommits} commits (${report.commitsPerSecond}/s)`);
if (idle) console.log(`idle      ${JSON.stringify(idle)}`);
if (runningAnimations.length) {
  console.log(`animating ${runningAnimations.length} on an idle table:`);
  for (const a of runningAnimations) console.log(`  ${a.state.padEnd(8)} ${String(a.name).padEnd(24)} ${a.className}`);
}
for (const outcome of matchOutcomes) console.log(`podium    ${JSON.stringify(outcome)}`);
console.log(`reload    ${JSON.stringify(reloadSurvival)}`);
console.log(`last card ${JSON.stringify(report.lastCard.geometry)}`);
const growth = metricSamples.at(-1);
const first = metricSamples[0];
if (first && growth) {
  console.log(
    `growth    nodes ${first.nodes}->${growth.nodes}  listeners ${first.listeners}->${growth.listeners}  heap ${first.heapMb}->${growth.heapMb}MB  layouts ${first.layouts}->${growth.layouts}  recalcs ${first.recalcs}->${growth.recalcs}`,
  );
}
if (report.loaf.topAttribution.length) {
  console.log('attribution:');
  for (const row of report.loaf.topAttribution) {
    console.log(`  ${String(row.ms).padStart(6)}ms  x${String(row.count).padStart(4)}  ${row.key}`);
  }
}
if (profileReport) {
  console.log(`\ncpu profile (${profileReport.totalMs}ms sampled):`);
  for (const frame of profileReport.frames.slice(0, 20)) {
    const where = frame.origin ? `${frame.origin.source}:${frame.origin.line}` : frame.url;
    console.log(`  ${String(frame.pct).padStart(5)}%  ${frame.ms}ms  ${frame.fn}  ${where}`);
  }
}
console.log(`\nreport: ${OUT}/${LABEL}.json`);
