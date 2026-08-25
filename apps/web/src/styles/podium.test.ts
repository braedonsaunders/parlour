import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles/podium.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`^${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('podium rank medals', () => {
  it('lets 1st/2nd pills hang off the plaque without clipping them', () => {
    const plaque = declarationsFor('.plaque');
    const medal = declarationsFor('.medal');
    const coins = declarationsFor('.coinField');
    const row = declarationsFor('.plaqueRow');

    expect(plaque).not.toMatch(/overflow:\s*hidden/);
    expect(medal).toMatch(/top:\s*-0\.9rem/);
    expect(row).toMatch(/padding-top:\s*1\.15rem/);
    expect(coins).toMatch(/overflow:\s*hidden/);
    expect(coins).toMatch(/border-radius:\s*inherit/);
    expect(declarationsFor('.stage')).not.toMatch(/7\.5rem/);
  });
});
