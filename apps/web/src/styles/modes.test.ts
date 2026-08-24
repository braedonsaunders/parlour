import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles/modes.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Anchored to the start of a line so a scoped variant like
  // `.fitCarousel .preview` can't be mistaken for the base `.preview` rule.
  const match = styles.match(new RegExp(`^${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
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

describe('mode picker screen fit', () => {
  it('pins the setup screen to the viewport instead of letting it scroll', () => {
    const screen = declarationsFor('.fitScreen');

    expect(screen).toMatch(/height:\s*var\(--app-height\);/);
    expect(screen).toMatch(/overflow:\s*hidden;/);
  });

  it('hands the leftover height to the carousel and shrinks only the artwork', () => {
    const carousel = declarationsFor('.fitCarousel');

    expect(carousel).toMatch(/flex:\s*1 1 auto;/);
    expect(carousel).toMatch(/min-height:\s*0;/);
    expect(declarationsFor('.fitCarousel .tile')).toMatch(/max-height:\s*100%;/);
    expect(declarationsFor('.fitCarousel .preview')).toMatch(/flex:\s*0 1 7\.5rem;/);
    expect(declarationsFor('.fitCarousel .description')).toMatch(/-webkit-line-clamp:\s*3;/);
  });

  it('keeps the header and footer out of the flexible middle', () => {
    expect(declarationsFor('.fitHeader')).toMatch(/flex:\s*none;/);
    expect(declarationsFor('.fitFooter')).toMatch(/flex:\s*none;/);
    expect(declarationsFor('.fitFooter')).toMatch(
      /padding-bottom:\s*max\(0\.75rem, env\(safe-area-inset-bottom\)\);/,
    );
  });
});
