import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('global app color modes', () => {
  it('keeps an identity layer in original and applies one richer pass to the full app', () => {
    const sourceRoot = join(process.cwd(), 'src');
    const globals = readFileSync(join(sourceRoot, 'app/globals.css'), 'utf8');

    expect(globals).toMatch(
      /--unplayable-filter:\s*grayscale\(0\.28\) saturate\(0\.66\) brightness\(0\.86\)/,
    );
    expect(globals).toMatch(/--unplayable-opacity:\s*1/);
    expect(globals).toMatch(
      /html\[data-color-mode='richer'\]\s*\{[^}]*filter:\s*saturate\(1\.26\)[^}]*--unplayable-filter:\s*grayscale\(0\.14\) saturate\(0\.72\) brightness\(0\.88\)[^}]*--unplayable-opacity:\s*1/s,
    );
    expect(globals).toMatch(/html\s*\{\s*filter:\s*saturate\(1\)/s);
    expect(globals).not.toMatch(/html\[data-color-mode='original'\]/);
  });
});
