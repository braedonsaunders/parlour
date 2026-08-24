import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateFanStep } from './HandRail';

const styles = readFileSync(join(process.cwd(), 'src/styles/table.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('calculateFanStep', () => {
  it('keeps UNO-like overlap for an ordinary seven-card hand', () => {
    expect(calculateFanStep(390, 82, 7)).toBeCloseTo(39.36);
  });

  it('compresses large hands enough to remain inside the edge gutters', () => {
    const width = 390;
    const cardWidth = 82;
    const count = 20;
    const step = calculateFanStep(width, cardWidth, count);
    const occupiedWidth = cardWidth + step * (count - 1);

    expect(occupiedWidth).toBeLessThanOrEqual(width - 40);
    expect(step).toBeGreaterThan(0);
  });

  it('centers a one-card hand without an offset', () => {
    expect(calculateFanStep(390, 82, 1)).toBe(0);
  });

  it('puts pointer hit-testing on each transformed card instead of its centered wrapper', () => {
    expect(declarationsFor('.handCard')).toMatch(/pointer-events:\s*none;/);
    expect(declarationsFor('.localHand .card')).toMatch(/pointer-events:\s*auto;/);
  });

  it('keeps status and primary game actions in opposing bottom thumb zones', () => {
    expect(declarationsFor('.screen')).toMatch(/min-height:\s*min\(420px,\s*100dvh\);/);
    expect(declarationsFor('.ownerStatusRail')).toMatch(/left:[^;]+;/);
    expect(declarationsFor('.ownerStatusRail')).toMatch(/bottom:[^;]+;/);
    expect(declarationsFor('.actionRail')).toMatch(/right:[^;]+;/);
    expect(declarationsFor('.actionRail')).toMatch(/bottom:[^;]+;/);
    expect(declarationsFor('.actionRail')).not.toMatch(/\btop\s*:/);
    expect(declarationsFor('.actionRail button')).toMatch(/min-height:\s*2\.75rem;/);
  });
});
