import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/**
 * How wide each board actually needs to be, so the test can do the arithmetic
 * the stylesheet is claiming rather than trust that it happened.
 *
 * `piles` is the widest single row of piles — the top row and the tableau are
 * laid out in the same box, so whichever needs more decides the board. The run
 * picker is excluded on purpose: it wraps to its own line above them, which is
 * the fix these numbers depend on.
 */
const BOARDS = {
  klondike: { piles: 7, gapRem: 0.4, padRem: 1.3 },
  freecell: { piles: 8, gapRem: 0.35, padRem: 1.3 },
  spider: { piles: 10, gapRem: 0.22, padRem: 1.3 },
  golf: { piles: 7, gapRem: 0.4, padRem: 1.3 },
} as const;

const GAMES = Object.keys(BOARDS) as (keyof typeof BOARDS)[];

const STYLES = Object.fromEntries(
  GAMES.map((game) => [game, readFileSync(join(ROOT, `src/styles/${game}.module.css`), 'utf8')]),
) as Record<keyof typeof BOARDS, string>;

const REM = 16;
/** The two phones the owner's boards have to survive. */
const PHONES = [390, 360];

function portraitBlock(css: string): string {
  const start = css.indexOf('@media (orientation: portrait) and (max-width: 700px)');
  expect(start, 'portrait block exists').toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error('unterminated portrait block');
}

/** The card size the stylesheet's own `min(Xrem, calc(...))` resolves to. */
function cardPx(block: string, viewport: number): number {
  const declaration = block.match(/--[a-z]+-card:\s*min\(([\d.]+)rem,\s*calc\((.+?)\)\)/s);
  expect(declaration, 'the card is width-derived, never a fixed rem').not.toBeNull();
  const ceiling = Number.parseFloat(declaration![1]!) * REM;
  const derived = declaration![2]!
    .replace(/100vw/g, String(viewport))
    .replace(/([\d.]+)rem/g, (_, value: string) => String(Number.parseFloat(value) * REM));
  // The expression is only ever `a - b - n * c) / d`, so Function is enough and
  // the input is this repository's own stylesheet.
  const value = Function(`"use strict"; return (${derived});`)() as number;
  return Math.min(ceiling, value);
}

describe('portrait table layouts', () => {
  /*
   * A board that overflows is worse than one that pans: with the pan removed,
   * the cards that do not fit are simply unreachable. That is exactly what
   * shipped once already, past a test that checked for the ABSENCE of
   * `overflow-x` and the PRESENCE of a width-derived variable — both true while
   * three of the four boards ran 45-124px off the side of the screen.
   *
   * So this asserts the outcome. It resolves the stylesheet's own card formula
   * and checks that the widest row of piles fits the phone.
   */
  it.each(GAMES)('the %s board fits a phone instead of running off it', (game) => {
    const block = portraitBlock(STYLES[game]);
    const { piles, gapRem, padRem } = BOARDS[game];

    for (const viewport of PHONES) {
      const card = cardPx(block, viewport);
      const needed = piles * card + (piles - 1) * gapRem * REM + padRem * REM;
      expect(
        needed,
        `${game} needs ${Math.round(needed)}px of a ${viewport}px screen`,
      ).toBeLessThanOrEqual(viewport);
      expect(card, `${game} card stays big enough to read`).toBeGreaterThan(24);
    }
  });

  it.each(GAMES)('the %s board never pans and never hides a pile', (game) => {
    const block = portraitBlock(STYLES[game]);
    expect(block).not.toMatch(/overflow-x:\s*auto/);
    expect(block).not.toContain('scroll-snap-type');
    expect(block).not.toContain('scroll-snap-align');
    expect(block).not.toMatch(/min-width:\s*\d+rem/);
    expect(STYLES[game]).not.toContain('visibility: hidden');
    expect(STYLES[game]).not.toContain('.rotateNotice');
  });

  /*
   * The run picker is a control, not a pile. Leaving it in the pile row cost
   * FreeCell 98px and Spider 128px of a 369px board — which no card size can
   * absorb — so every game that has one gives it its own line.
   */
  it.each(GAMES.filter((game) => STYLES[game].includes('.runPicker')))(
    'the %s run picker takes its own line rather than pile width',
    (game) => {
      expect(portraitBlock(STYLES[game])).toMatch(/\.runPicker\s*\{[^}]*flex:\s*1 0 100%;/s);
    },
  );
});
