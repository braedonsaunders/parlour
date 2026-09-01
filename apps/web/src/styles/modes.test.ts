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

describe('mode tile compositing', () => {
  it('lifts on hover without a CSS filter or a standing will-change layer', () => {
    const rest = declarationsFor('.tile');
    const hover = declarationsFor('.tile:hover');

    expect(rest).not.toMatch(/will-change:/);
    expect(rest).not.toMatch(/filter:/);
    expect(hover).not.toMatch(/filter:/);
    expect(hover).toMatch(/transform:/);
  });

  it('paints the selected ring and glow on the tile at every breakpoint', () => {
    const selected = declarationsFor(".tile[data-selected='true']");

    expect(selected).toMatch(/border-color:\s*var\(--tile-accent/);
    expect(selected).toMatch(/0 0 0 2px var\(--tile-accent/);
    expect(selected).toMatch(/0 0 34px -4px var\(--tile-accent/);
  });
});

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

    // Basis zero, not auto: the carousel takes what the header and footer leave
    // rather than competing with the controls for it.
    expect(carousel).toMatch(/flex:\s*1 1 0;/);
    expect(carousel).toMatch(/min-height:\s*0;/);
    expect(declarationsFor('.fitCarousel .tile')).toMatch(/max-height:\s*100%;/);
    expect(declarationsFor('.fitCarousel .preview')).toMatch(/flex:\s*0 1 7\.5rem;/);
    expect(declarationsFor('.fitCarousel .description')).toMatch(/-webkit-line-clamp:\s*3;/);
  });

  it('keeps the header out of the flexible middle', () => {
    expect(declarationsFor('.fitHeader')).toMatch(/flex:\s*none;/);
  });

  it('clears the phone chrome the header would otherwise hide under', () => {
    const header = declarationsFor('.fitHeader');

    // The bug this guards: a standalone iOS window puts the status bar over the
    // top of the page, so a header padded by a fixed amount hands the player a
    // back link they cannot tap.
    expect(header).toMatch(/padding-top:\s*max\(1\.25rem, env\(safe-area-inset-top\)\);/);
    expect(header).toMatch(/padding-right:\s*max\(1\.5rem, env\(safe-area-inset-right\)\);/);
    expect(header).toMatch(/padding-left:\s*max\(1\.5rem, env\(safe-area-inset-left\)\);/);
  });

  it('lets a tall footer scroll inside itself rather than clip or take the screen', () => {
    const footer = declarationsFor('.fitFooter');

    expect(footer).toMatch(/flex:\s*none;/);
    expect(footer).toMatch(/max-height:\s*62%;/);
    expect(footer).toMatch(/overflow-y:\s*auto;/);
    expect(footer).toMatch(/min-height:\s*0;/);
    expect(footer).toMatch(/padding-bottom:\s*max\(0\.75rem, env\(safe-area-inset-bottom\)\);/);
  });
});
