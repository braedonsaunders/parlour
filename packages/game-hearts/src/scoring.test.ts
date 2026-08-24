import { describe, expect, it } from 'vitest';
import { QUEEN_SPADES } from './cards';
import {
  adjustedHandPoints,
  handResult,
  moonShooterOf,
  rawHandPoints,
} from './scoring';

const rules = (overrides: Partial<Parameters<typeof adjustedHandPoints>[1]> = {}) => ({
  jackDiamonds: false,
  moonShift: 'opponents' as const,
  ...overrides,
});

describe('raw points', () => {
  it('counts hearts as 1 and the queen as 13', () => {
    expect(rawHandPoints([['H5', 'H14'], [QUEEN_SPADES], ['C2']], false)).toEqual([2, 13, 0]);
  });

  it('subtracts ten for the jack of diamonds when enabled', () => {
    expect(rawHandPoints([['D11']], false)[0]).toBe(0);
    expect(rawHandPoints([['D11', 'H3']], true)[0]).toBe(-9);
  });
});

describe('shooting the moon', () => {
  const thirteenHearts = Array.from({ length: 13 }, (_, i) => `H${i + 1}`);
  const moonTaken = [thirteenHearts, [], [], []];

  it('detects only a complete thirteen-hearts-plus-queen capture', () => {
    expect(moonShooterOf([thirteenHearts, [], [], []])).toBeNull();
    const withQueen = [[...thirteenHearts, QUEEN_SPADES], [], [], []];
    expect(moonShooterOf(withQueen)).toBe(0);
    const nearMiss = [[...thirteenHearts.slice(0, -1), QUEEN_SPADES], [], [], []];
    expect(moonShooterOf(nearMiss)).toBeNull();
  });

  it('adds 26 to every opponent under the default shift', () => {
    const taken = [[...thirteenHearts, QUEEN_SPADES], [], [], []];
    const { points, shooter } = adjustedHandPoints(taken, rules());
    expect(shooter).toBe(0);
    expect(points).toEqual([0, 26, 26, 26]);
  });

  it('subtracts 26 from the shooter when configured', () => {
    const taken = [[...thirteenHearts, QUEEN_SPADES], [], [], []];
    const { points } = adjustedHandPoints(taken, rules({ moonShift: 'self' }));
    expect(points).toEqual([0, 0, 0, 0]);
  });

  it('a lone queen is not a moon', () => {
    expect(moonShooterOf([[QUEEN_SPADES], [], [], []])).toBeNull();
  });
});

describe('hand result rankings', () => {
  it('ranks fewest points first and crowns a sole minimum', () => {
    const taken = [['H2'], [], ['H3', 'H4'], ['H5']];
    const { points } = adjustedHandPoints(taken, rules());
    const result = handResult(points, taken, []);
    expect(result.rankings.map((r) => r.seat)).toEqual([1, 0, 3, 2]);
    expect(result.winner).toBe(1);
    expect(result.reason).toBe('hand-complete');
  });

  it('shares rank one on ties and crowns nobody', () => {
    const taken = [['H2'], [], ['H3'], []];
    const { points } = adjustedHandPoints(taken, rules());
    const result = handResult(points, taken, []);
    expect(result.rankings.filter((r) => r.rank === 1).map((r) => r.seat)).toEqual([1, 3]);
    expect(result.winner).toBeNull();
  });

  it('flags disputed seats in detail without changing rank', () => {
    const taken = [[], ['H2'], [], []];
    const { points } = adjustedHandPoints(taken, rules());
    const result = handResult(points, taken, [1]);
    const seatOne = result.rankings.find((r) => r.seat === 1)!;
    expect(seatOne.detail?.disputed).toBe(true);
    expect(result.reason).toBe('hand-complete');
  });

  it('reports a moon in the reason', () => {
    const thirteenHearts = Array.from({ length: 13 }, (_, i) => `H${i + 1}`);
    const moonTaken = [[...thirteenHearts, QUEEN_SPADES], [], [], []];
    const { points } = adjustedHandPoints(moonTaken, rules({ moonShift: 'opponents' }));
    const result = handResult(points, moonTaken, []);
    expect(result.reason).toBe('moon-shot');
    expect(result.winner).toBe(0);
  });
});
