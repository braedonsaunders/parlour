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

describe('portrait table layouts', () => {
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
});
