import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles/modes.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('mode picker artwork containment', () => {
  it('clips animated artwork in an isolated block-level preview frame', () => {
    const preview = declarationsFor('.preview');

    expect(preview).toMatch(/display:\s*block;/);
    expect(preview).toMatch(/overflow:\s*hidden;/);
    expect(preview).toMatch(/isolation:\s*isolate;/);
  });

  it('gives edge modes enough responsive gutter space to center in the viewport', () => {
    const carousel = declarationsFor('.centeredCarousel');
    const tile = declarationsFor('.centeredCarousel .tile');

    expect(carousel).toMatch(/--mode-carousel-gutter:\s*max\(1\.5rem, calc\(50% - 10\.5rem\)\);/);
    expect(carousel).toMatch(/scroll-padding-inline:\s*var\(--mode-carousel-gutter\);/);
    expect(tile).toMatch(/width:\s*var\(--mode-tile-width\);/);
  });
});
