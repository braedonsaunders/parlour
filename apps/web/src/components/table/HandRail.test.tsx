import { describe, expect, it } from 'vitest';
import { calculateFanStep } from './HandRail';

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
});
