import { describe, expect, it } from 'vitest';
import { stateHash } from './runtime';

describe('stateHash', () => {
  it('matches its golden value for a fixed object', () => {
    const golden = {
      turn: 2,
      hands: [['S1', 'H13'], ['D7']],
      discard: ['C4'],
      flags: { knocked: true, blitz: false },
      label: 'round 1',
    };
    expect(stateHash(golden)).toBe('7a1350b7');
  });

  it('is key-order independent but array-order sensitive', () => {
    expect(stateHash({ a: 1, b: 2 })).toBe(stateHash({ b: 2, a: 1 }));
    expect(stateHash([1, 2])).not.toBe(stateHash([2, 1]));
  });

  it('ignores undefined properties but not null ones', () => {
    expect(stateHash({ a: 1, b: undefined })).toBe(stateHash({ a: 1 }));
    expect(stateHash({ a: 1, b: null })).not.toBe(stateHash({ a: 1 }));
  });

  it('distinguishes types and nesting', () => {
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: '1' }));
    expect(stateHash({ a: { b: 1 } })).not.toBe(stateHash({ a: [1] }));
    expect(stateHash(null)).not.toBe(stateHash(0));
  });

  it('returns 8 lowercase hex chars', () => {
    for (const value of [0, 'x', { a: 1 }, [1, 2, 3], null, true]) {
      expect(stateHash(value)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});
