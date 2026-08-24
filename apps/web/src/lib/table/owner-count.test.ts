import { describe, expect, it } from 'vitest';
import { ownerCurrentCount } from './owner-count';

describe('ownerCurrentCount', () => {
  it('auto-sums the highest same-suit total in the local hand', () => {
    expect(
      ownerCurrentCount([
        { hand: ['H1', 'H13', 'S10'], isLocal: true },
        { hand: ['S1', 'S13', 'S12'], isLocal: false },
      ]),
    ).toBe(21);
  });

  it('updates from the current local hand and ignores opponent hands', () => {
    const opponent = { hand: ['D1', 'D13', 'D12'], isLocal: false };

    expect(ownerCurrentCount([opponent, { hand: ['C4', 'C5', 'H10'], isLocal: true }])).toBe(10);
    expect(ownerCurrentCount([opponent, { hand: ['C4', 'C5', 'C9'], isLocal: true }])).toBe(18);
  });

  it('returns null when this view has no local hand', () => {
    expect(ownerCurrentCount([{ hand: ['S1', 'S13', 'S12'], isLocal: false }])).toBeNull();
  });
});
