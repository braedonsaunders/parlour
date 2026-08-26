import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8')) as {
  orientation?: string;
};

const STYLES = Object.fromEntries(
  ['freecell', 'golf', 'klondike', 'spider', 'spades'].map((game) => [
    game,
    readFileSync(join(ROOT, `src/styles/${game}.module.css`), 'utf8'),
  ]),
);

describe('portrait table layouts', () => {
  it('keeps the installed app landscape while shared high-card-count fans remain', () => {
    expect(MANIFEST.orientation).toBe('landscape');
  });

  it.each(['freecell', 'golf', 'klondike', 'spider'])(
    'keeps the %s board interactive behind a horizontal pan',
    (game) => {
      const css = STYLES[game]!;
      expect(css).toContain('@media (orientation: portrait) and (max-width: 700px)');
      expect(css).toMatch(/\.board\s*\{[^}]*overflow-x:\s*auto;/s);
      expect(css).toMatch(/\.topRow,\s*\.tableau\s*\{[^}]*min-width:\s*[\d.]+rem;/s);
      expect(css).toContain('scroll-snap-type: x proximity');
      expect(css).not.toContain('visibility: hidden');
      expect(css).not.toContain('.rotateNotice');
    },
  );

  it('turns the Spades fan into a full-size, horizontally scrollable hand', () => {
    const css = STYLES.spades!;
    expect(css).toContain('@media (orientation: portrait) and (max-width: 820px)');
    expect(css).toMatch(
      /\[data-zone\^='hand:'\]\s*\{[^}]*overflow-x:\s*auto;[^}]*touch-action:\s*pan-x;/s,
    );
    expect(css).toMatch(/\[data-hand-card\]\s*\{[^}]*min-width:\s*2\.75rem;/s);
    expect(css).toContain('[data-hand-fan]');
    expect(css).not.toContain('.rotateNotice');
  });
});
