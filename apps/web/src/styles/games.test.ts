import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles/games.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`^${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('game library layout', () => {
  it('adds future games as normal desktop rows without clipping the page', () => {
    const page = declarationsFor('.page');
    const grid = declarationsFor('.gameGrid');

    expect(page).toMatch(/min-height:\s*var\(--app-height\);/);
    expect(page).not.toMatch(/(?:^|[;\s])height:\s*(?:100dvh|var\(--app-height\));/);
    expect(grid).toMatch(/display:\s*grid;/);
    expect(grid).toMatch(/grid-auto-flow:\s*row;/);
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  });

  it('uses one vertical grid column on phones with no horizontal scroller', () => {
    const phone = styles.slice(styles.indexOf('@media (max-width: 640px)'));

    expect(phone).toMatch(
      /\.gameGrid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(phone).not.toMatch(/overflow-x:\s*auto;/);
    expect(phone).not.toMatch(/scroll-snap-type:\s*x/);
  });
});
