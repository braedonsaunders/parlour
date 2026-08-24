/**
 * What the compositor was asked to hold.
 *
 * The timeline said the table's largest single cost is `Commit` — the main
 * thread handing layers to the compositor — which scales with how many layers
 * there are and how big their property trees have grown. This lists them, with
 * the element that caused each one, so "125 layers" becomes a list of specific
 * things to stop promoting.
 *
 *   node scripts/layers-table.mjs [url-path]
 */

import { chromium, devices } from '@playwright/test';

const path =
  process.argv[2] ??
  '/dev/stress/?seats=7&hand=18&opponentHand=12&stepMs=420&pickup=6&pickupEvery=4';
const base = process.env.PERF_BASE ?? 'http://127.0.0.1:4321';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: devices['iPhone 14'].viewport,
  deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
  hasTouch: true,
});
const page = await context.newPage();
const session = await context.newCDPSession(page);

await page.goto(`${base}${path}`);
await page
  .locator('[role="list"][data-zone] [role="listitem"]')
  .first()
  .waitFor({ timeout: 30_000 });
// PERF_CSS tests a hypothesis about *why* something is promoted without a
// rebuild: inject the property you suspect, see whether the layer disappears.
if (process.env.PERF_CSS) await page.addStyleTag({ content: process.env.PERF_CSS });
await page.waitForTimeout(3_000);

const layers = await new Promise((resolve) => {
  let last = [];
  let timer = null;
  session.on('LayerTree.layerTreeDidChange', ({ layers: next }) => {
    last = next ?? [];
    clearTimeout(timer);
    timer = setTimeout(() => resolve(last), 800);
  });
  session.send('LayerTree.enable');
  setTimeout(() => resolve(last), 8_000);
});

await session.send('DOM.enable');
await session.send('DOM.getDocument', { depth: -1, pierce: true });

/** Groups identical elements together — 18 hand cards are one finding, not 18. */
const groups = new Map();
for (const layer of layers) {
  let name = '(no backing node)';
  if (layer.backendNodeId) {
    try {
      const { node } = await session.send('DOM.describeNode', {
        backendNodeId: layer.backendNodeId,
      });
      const attrs = {};
      for (let index = 0; index < (node.attributes ?? []).length; index += 2) {
        attrs[node.attributes[index]] = node.attributes[index + 1];
      }
      const marks = Object.keys(attrs)
        .filter((key) => key.startsWith('data-') || key === 'role')
        .slice(0, 3)
        .map((key) => (attrs[key] ? `${key}="${attrs[key]}"` : key));
      // Hashed module class names are noise; the first is enough to find it.
      const cls = (attrs.class ?? '').split(/\s+/).filter(Boolean)[0];
      name = `${node.localName}${cls ? `.${cls}` : ''}${marks.length ? ` [${marks.join(' ')}]` : ''}`;
    } catch {
      name = '(node gone)';
    }
  }
  const key = name.replace(/"\d+"/g, '"N"').replace(/data-card-id="[^"]*"/, 'data-card-id');
  const entry = groups.get(key) ?? { count: 0, megapixels: 0 };
  entry.count += 1;
  entry.megapixels += ((layer.width ?? 0) * (layer.height ?? 0)) / 1_000_000;
  groups.set(key, entry);
}

const total = layers.reduce((all, l) => all + ((l.width ?? 0) * (l.height ?? 0)) / 1_000_000, 0);
console.log(`\n  ${path}`);
console.log(`  ${layers.length} composited layers · ${total.toFixed(1)} Mpx of texture\n`);
console.log('  count    Mpx   element');
console.log(`  ${'-'.repeat(96)}`);
for (const [name, entry] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(
    `  ${String(entry.count).padStart(5)}  ${entry.megapixels.toFixed(2).padStart(5)}   ${name}`,
  );
}
console.log('');

await browser.close();
