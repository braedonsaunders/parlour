import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(sourceRoot, path), 'utf8');

describe('mobile-landscape game overlays', () => {
  it('centers the animated Draw Four challenge without competing transforms', () => {
    const wild = read('styles/wild.module.css');

    expect(wild).toMatch(/\.challengePrompt\s*\{[^}]*left:\s*50%[^}]*translate:\s*-50% 0/s);
    expect(wild).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.challengePrompt\s*\{[^}]*top:\s*50%[^}]*bottom:\s*auto[^}]*translate:\s*-50% -50%/,
    );
  });
});

describe('shared mobile-landscape match end', () => {
  it('uses one clipped viewport and one unwrapped row for every result', () => {
    const page = read('app/match-end/matchEnd.module.css');
    const podium = read('styles/podium.module.css');
    const rivalry = read('styles/rivalry.module.css');

    expect(page).toMatch(
      /@media \(orientation: landscape\) and \(max-height: 560px\)[\s\S]*?\.page\s*\{[^}]*height:\s*var\(--app-height\)[^}]*overflow:\s*hidden/,
    );
    expect(podium).toMatch(
      /grid-template-columns:\s*repeat\(var\(--podium-seat-count\), minmax\(0, 1fr\)\)/,
    );
    expect(rivalry).toMatch(
      /grid-template-columns:\s*repeat\(var\(--rivalry-count\), minmax\(0, 1fr\)\)/,
    );
  });
});
