import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyles = (name: string) =>
  readFileSync(join(process.cwd(), `src/styles/${name}.module.css`), 'utf8');

const table = readStyles('table');
const euchre = readStyles('euchre');
const gin = readStyles('gin');
const hearts = readStyles('hearts');
const president = readStyles('president');
const wild = readStyles('wild');

function declarationsFor(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

function zIndexFor(source: string, selector: string): number {
  const match = declarationsFor(source, selector).match(/z-index:\s*(-?\d+)\s*;/);
  expect(match, `${selector} declares a numeric z-index`).not.toBeNull();
  return Number(match![1]);
}

describe('table overlay stacking', () => {
  it('keeps the Gin result sheet above controls and FX', () => {
    expect(zIndexFor(gin, '.handEnd')).toBeGreaterThan(zIndexFor(table, '.actionRail'));
    expect(zIndexFor(gin, '.handEnd')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
  });

  it('keeps Hearts pass UI clear of the local hand and north seat', () => {
    expect(zIndexFor(hearts, '.passBanner')).toBeGreaterThan(zIndexFor(table, '.localHand'));
    expect(declarationsFor(hearts, '.passBanner')).toMatch(/bottom:\s*30%;/);
    expect(declarationsFor(hearts, '.tableBadges')).toMatch(
      /top:\s*clamp\(7\.75rem,\s*20vh,\s*9rem\);/,
    );
  });

  it('keeps President role moments above the next-deal flights', () => {
    expect(zIndexFor(president, '.celebration')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
  });

  it('keeps Wild jump-in notices above flights and moves short-screen badges beside the center', () => {
    expect(zIndexFor(wild, '.jumpBanner')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
    expect(wild).toMatch(
      /@media \(max-height:\s*560px\)[\s\S]*?\.tableBadges\s*\{[^}]*left:\s*19%;[^}]*top:\s*31%;[^}]*transform:\s*none;/,
    );
  });

  it('parks the Euchre trump badge below the north player', () => {
    expect(declarationsFor(euchre, '.trumpBadge')).toMatch(
      /top:\s*clamp\(6\.4rem,\s*17vh,\s*7\.8rem\);/,
    );
  });
});
