import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const scenes = readFileSync(join(process.cwd(), 'src/styles/scenes.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = scenes.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('scene canvas compositing', () => {
  it('pins the live canvas to its own compositor texture', () => {
    const canvas = declarationsFor('.canvas');
    expect(canvas).toMatch(/transform:\s*translateZ\(0\)/);
    expect(canvas).toMatch(/backface-visibility:\s*hidden/);
  });
});
