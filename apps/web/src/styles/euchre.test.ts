import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(join(process.cwd(), 'src/styles/euchre.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('Euchre table layout', () => {
  it('uses one fixed button box for every bidding action', () => {
    expect(declarationsFor('.bidAction')).toMatch(/width:\s*8rem;/);
    expect(declarationsFor('.bidAction')).toMatch(/min-height:\s*3\.25rem;/);
  });

  it('keeps team scores in a compact rail below the left HUD label', () => {
    expect(declarationsFor('.hudCluster')).toMatch(/display:\s*grid;/);
    expect(declarationsFor('.teamScores')).toMatch(/display:\s*flex;/);
    expect(declarationsFor('.teamChip small')).toMatch(/white-space:\s*nowrap;/);
  });
});
