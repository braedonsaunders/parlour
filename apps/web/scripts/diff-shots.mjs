/**
 * Pixel-diffs two screenshots of the table.
 *
 * "It looks the same to me" is not a good enough answer when the brief says the
 * look may not change. This decodes both images in a browser, compares every
 * pixel, and reports how many differ and by how much — and writes a mask of
 * where, so a real difference can be looked at rather than argued about.
 *
 *   node scripts/diff-shots.mjs <before.png> <after.png> [mask.png]
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const before = resolve(process.cwd(), process.argv[2]);
const after = resolve(process.cwd(), process.argv[3]);
const mask = process.argv[4] ? resolve(process.cwd(), process.argv[4]) : null;

/** Below this, a channel difference is compression or antialiasing, not a change. */
const THRESHOLD = 8;

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(
  async ([a, b, threshold]) => {
    const load = (dataUrl) =>
      new Promise((done, fail) => {
        const image = new Image();
        image.onload = () => done(image);
        image.onerror = fail;
        image.src = dataUrl;
      });
    const [left, right] = await Promise.all([load(a), load(b)]);
    if (left.width !== right.width || left.height !== right.height) {
      return {
        error: `size mismatch: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
      };
    }
    const draw = (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    };
    const one = draw(left);
    const two = draw(right);
    const out = document.createElement('canvas');
    out.width = left.width;
    out.height = left.height;
    const outContext = out.getContext('2d');
    const overlay = outContext.createImageData(left.width, left.height);

    let differing = 0;
    let worst = 0;
    let total = 0;
    const rows = new Map();
    for (let index = 0; index < one.data.length; index += 4) {
      const delta = Math.max(
        Math.abs(one.data[index] - two.data[index]),
        Math.abs(one.data[index + 1] - two.data[index + 1]),
        Math.abs(one.data[index + 2] - two.data[index + 2]),
      );
      worst = Math.max(worst, delta);
      if (delta > threshold) {
        differing += 1;
        total += delta;
        const y = Math.floor(index / 4 / left.width);
        rows.set(y, (rows.get(y) ?? 0) + 1);
        overlay.data[index] = 255;
        overlay.data[index + 1] = 0;
        overlay.data[index + 2] = 0;
        overlay.data[index + 3] = 255;
      } else {
        const grey = one.data[index] * 0.2;
        overlay.data[index] = grey;
        overlay.data[index + 1] = grey;
        overlay.data[index + 2] = grey;
        overlay.data[index + 3] = 255;
      }
    }
    outContext.putImageData(overlay, 0, 0);
    const bands = [...rows.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
    return {
      pixels: one.data.length / 4,
      differing,
      share: differing / (one.data.length / 4),
      meanDelta: differing ? total / differing : 0,
      worst,
      bands,
      mask: out.toDataURL('image/png'),
    };
  },
  [
    `data:image/png;base64,${readFileSync(before).toString('base64')}`,
    `data:image/png;base64,${readFileSync(after).toString('base64')}`,
    THRESHOLD,
  ],
);
await browser.close();

if (result.error) {
  console.error(`  ${result.error}`);
  process.exit(1);
}
console.log(`\n  ${before}`);
console.log(`  ${after}\n`);
console.log(
  `  differing pixels : ${result.differing} of ${result.pixels} (${(result.share * 100).toFixed(3)}%)`,
);
console.log(`  mean difference  : ${result.meanDelta.toFixed(1)} / 255 where it differs`);
console.log(`  worst channel    : ${result.worst} / 255`);
if (result.bands.length) {
  console.log(`  busiest rows     : ${result.bands.map(([y, n]) => `y=${y} (${n}px)`).join(', ')}`);
}
if (mask) {
  writeFileSync(mask, Buffer.from(result.mask.split(',')[1], 'base64'));
  console.log(`  mask written to  : ${mask}`);
}
console.log('');
