import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const STYLES = Object.fromEntries(
  ['freecell', 'golf', 'klondike', 'spider'].map((game) => [
    game,
    readFileSync(join(ROOT, `src/styles/${game}.module.css`), 'utf8'),
  ]),
);

/**
 * Portrait boards must FIT the screen, not pan. The previous version of this
 * test asserted the regression — overflow-x, min-width and scroll-snap on
 * every game — and it was the only guard here. It now asserts the opposite:
 * no horizontal scroll on .board, and a width-derived card variable, so the
 * regression cannot come back. The run picker, if present, must move to the
 * row's start so it never budgets against the piles; without an order swap
 * there is no place for it.
 */
describe('portrait table layouts', () => {
  it.each(['freecell', 'golf', 'klondike', 'spider'])(
    'the %s portrait board fits with no horizontal scroll',
    (game) => {
      const css = STYLES[game]!;
      const media = css.slice(
        css.indexOf('@media (orientation: portrait) and (max-width: 700px)'),
      );
      // No pan machinery may survive in the portrait block.
      expect(media).not.toMatch(/\.board\s*\{[^}]*overflow-x:\s*auto;/s);
      expect(media).not.toMatch(/\.topRow,\s*\.tableau\s*\{[^}]*min-width:\s*[\d.]+rem;/s);
      expect(media).not.toContain('scroll-snap-type');
      expect(media).not.toContain('scroll-snap-align');
      // The card variable must be width-derived, never a fixed rem.
      expect(media).toMatch(/calc\(\(100vw\s*-\s*[\d.]+rem\s*-\s*[\d\s*.*rem]+\)\s*\//s);
      expect(css).not.toContain('visibility: hidden');
      expect(css).not.toContain('.rotateNotice');
      // A run picker, if present, must be ordered to the start of the row.
      if (css.includes('.runPicker')) {
        expect(css).toMatch(/\.runPicker\s*\{[^}]*order:\s*-1;/s);
      }
    },
  );
});
