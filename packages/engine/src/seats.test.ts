import { describe, expect, it } from 'vitest';
import { advanceSeat, seatOrder } from './seats';

describe('seat ring', () => {
  it('moves clockwise and wraps', () => {
    expect(advanceSeat(3, 4)).toBe(0);
    expect(advanceSeat(2, 4, 3)).toBe(1);
  });

  it('normalizes reverse movement', () => {
    expect(advanceSeat(0, 4, 1, -1)).toBe(3);
    expect(advanceSeat(1, 4, 3, -1)).toBe(2);
  });

  it('lists every seat from the requested leader', () => {
    expect(seatOrder(2, 4)).toEqual([2, 3, 0, 1]);
    expect(seatOrder(0, 0)).toEqual([]);
  });

  it('rejects an invalid live ring', () => {
    expect(() => advanceSeat(0, 0)).toThrow(/positive seat count/);
  });
});
