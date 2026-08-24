import { describe, expect, it } from 'vitest';
import { hasValidSeatCount, seatRangeFor } from './seatRange';

describe('seatRange', () => {
  it('keeps the shared default ring at 2–4', () => {
    expect(seatRangeFor('blitz')).toEqual({ min: 2, max: 4 });
    expect(seatRangeFor('wildpile')).toEqual({ min: 2, max: 4 });
    expect(seatRangeFor(undefined)).toEqual({ min: 2, max: 4 });
    expect(hasValidSeatCount('blitz', 4)).toBe(true);
    expect(hasValidSeatCount('blitz', 5)).toBe(false);
  });

  it('pins spades to exactly four seats — partnerships have no other shape', () => {
    expect(seatRangeFor('spades')).toEqual({ min: 4, max: 4 });
    expect(hasValidSeatCount('spades', 4)).toBe(true);
    expect(hasValidSeatCount('spades', 3)).toBe(false);
    expect(hasValidSeatCount('spades', 5)).toBe(false);
    expect(hasValidSeatCount('spades', 2)).toBe(false);
  });

  it('opens the president ring to 4–8 without touching other games', () => {
    expect(seatRangeFor('president')).toEqual({ min: 4, max: 8 });
    expect(hasValidSeatCount('president', 3)).toBe(false);
    expect(hasValidSeatCount('president', 8)).toBe(true);
    expect(hasValidSeatCount('president', 9)).toBe(false);
    expect(hasValidSeatCount('president', 5.5)).toBe(false);
  });
});
