import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(join(process.cwd(), 'src/styles/ratscrew.module.css'), 'utf8');
const tableStylesheet = readFileSync(join(process.cwd(), 'src/styles/table.module.css'), 'utf8');

function zIndexFor(source: string, selector: string): number {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  const zIndex = match![1]!.match(/z-index:\s*(-?\d+)\s*;/);
  expect(zIndex, `${selector} declares a numeric z-index`).not.toBeNull();
  return Number(zIndex![1]);
}

describe('Rat Screw table stacking', () => {
  it('keeps the slap-pattern alert above the center pile and card flights', () => {
    expect(zIndexFor(stylesheet, '.slapBanner')).toBeGreaterThan(
      zIndexFor(stylesheet, '.centerPile'),
    );
    expect(zIndexFor(stylesheet, '.slapBanner')).toBeGreaterThan(
      zIndexFor(tableStylesheet, '.fxLayer'),
    );
  });

  it('keeps the challenge notice above player seats', () => {
    expect(zIndexFor(stylesheet, '.challengeBanner')).toBeGreaterThan(
      zIndexFor(tableStylesheet, '.seat'),
    );
    expect(stylesheet).toMatch(
      /\.challengeBanner\s*\{[^}]*top:\s*clamp\(8\.5rem,\s*20vh,\s*10rem\);/,
    );
  });
});
