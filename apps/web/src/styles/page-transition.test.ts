import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/page-transition.module.css'), 'utf8');

describe('menu page transition', () => {
  it('slides on transform only, so Windows does not paint a faded shell black', () => {
    expect(css).toMatch(/@keyframes pageIn/);
    expect(css).toMatch(/@keyframes menuInForward/);
    expect(css).toMatch(/@keyframes menuInBack/);
    expect(css).toMatch(/translate3d\(40px, 0, 0\)/);
    expect(css).toMatch(/translate3d\(-40px, 0, 0\)/);
    expect(css).not.toMatch(/opacity:/);
  });
});
