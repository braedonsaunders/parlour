import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = globals.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('panel chrome', () => {
  it('does not sample the scene through a backdrop-filter', () => {
    expect(declarationsFor('.panel-soft')).not.toMatch(/backdrop-filter:/);
  });
});

describe('fat button chrome', () => {
  it('lifts on hover without a CSS filter or a standing will-change layer', () => {
    const rest = declarationsFor('.btn-fat');
    const hover = declarationsFor('.btn-fat:hover');

    expect(rest).not.toMatch(/will-change:/);
    expect(rest).not.toMatch(/filter:/);
    expect(hover).not.toMatch(/filter:/);
    expect(hover).toMatch(/transform:/);
  });
});
