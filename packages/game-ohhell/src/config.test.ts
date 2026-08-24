import { describe, expect, it } from 'vitest';
import { ohhellConfig } from './config';
import { dealCeiling, planDeal, roundSchedule, trumpCeiling } from './schedule';

describe('config schema', () => {
  it('resolves defaults and is idempotent', () => {
    const once = ohhellConfig.resolve({});
    expect(once).toEqual({
      handSize: 8,
      dealer: 0,
      handArc: 'updown',
      maxHand: 9,
      hookRule: true,
      scoring: 'exactOnly',
      wizards: false,
      trumpOnLastRound: false,
    });
    expect(ohhellConfig.resolve(once)).toEqual(once);
  });

  it('clamps ints and rejects unknown enum values', () => {
    expect(ohhellConfig.resolve({ maxHand: 99 }).maxHand).toBe(20);
    expect(ohhellConfig.resolve({ handSize: 0 }).handSize).toBe(1);
    expect(ohhellConfig.resolve({ handArc: 'sideways' as never }).handArc).toBe('updown');
    expect(ohhellConfig.resolve({ scoring: 'double' as never }).scoring).toBe('exactOnly');
  });

  it('ships the classic / quick / wizard presets', () => {
    expect(ohhellConfig.presets.map((preset) => preset.id)).toEqual(['classic', 'quick', 'wizard']);
    expect(ohhellConfig.resolve({ handArc: 'down', maxHand: 5 })).toMatchObject({
      handArc: 'down',
      maxHand: 5,
      hookRule: true,
    });
    expect(ohhellConfig.resolve({ wizards: true }).wizards).toBe(true);
  });
});

describe('hand-size arcs', () => {
  // floor(51/seats): every generated round keeps one card over for the flip
  const CEILINGS: Readonly<Record<number, number>> = { 3: 17, 4: 12, 5: 10, 6: 8, 7: 7 };

  for (const [seatText, ceiling] of Object.entries(CEILINGS)) {
    const seats = Number(seatText);
    it(`caps the ${seats}-seat arc at floor(51/${seats}) = ${ceiling}`, () => {
      expect(trumpCeiling(seats, false)).toBe(ceiling);
      const schedule = roundSchedule({ handArc: 'updown', maxHand: 20, wizards: false }, seats);
      expect(Math.max(...schedule)).toBe(ceiling);
      expect(schedule.every((size) => size >= 1 && size <= ceiling)).toBe(true);
    });
  }

  it('runs the classic up-down arc symmetrically (1…peak…1)', () => {
    const schedule = roundSchedule({ handArc: 'updown', maxHand: 9, wizards: false }, 4);
    expect(schedule).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(schedule.length).toBe(2 * 9 - 1);
  });

  it('supports up-only and down-only arcs', () => {
    expect(roundSchedule({ handArc: 'up', maxHand: 3, wizards: false }, 4)).toEqual([1, 2, 3]);
    expect(roundSchedule({ handArc: 'down', maxHand: 5, wizards: false }, 4)).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });

  it('deals the quick preset from five straight down', () => {
    const quick = ohhellConfig.resolve({ handArc: 'down', maxHand: 5 });
    expect(roundSchedule(quick, 4)).toEqual([5, 4, 3, 2, 1]);
  });

  it('clamps to the wizard deck when wizards are on', () => {
    expect(trumpCeiling(4, true)).toBe(Math.floor(59 / 4));
    expect(roundSchedule({ handArc: 'updown', maxHand: 20, wizards: true }, 4)).toContain(
      Math.floor(59 / 4),
    );
    expect(dealCeiling(4, true)).toBe(15);
  });
});

describe('planDeal', () => {
  it('keeps a spare card for the trump flip on ordinary rounds', () => {
    const plan = planDeal(12, 4, false, false);
    expect(plan).toEqual({ handSize: 12, wholeDeck: false });
  });

  it('flags a whole-deck deal — nothing left to turn', () => {
    expect(planDeal(13, 4, false, false)).toEqual({ handSize: 13, wholeDeck: true });
    expect(planDeal(20, 3, true, false)).toEqual({ handSize: 20, wholeDeck: true });
  });

  it('shrinks a whole-deck round when cut-trump is on', () => {
    const plan = planDeal(13, 4, false, true);
    expect(plan.handSize).toBe(trumpCeiling(4, false));
    expect(plan.wholeDeck).toBe(false);
  });

  it('never proposes dealing more cards than exist', () => {
    for (let seats = 3; seats <= 7; seats++) {
      for (let handSize = 1; handSize <= 20; handSize++) {
        const plan = planDeal(handSize, seats, false, false);
        expect(plan.handSize * seats).toBeLessThanOrEqual(52);
        expect(plan.handSize).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
