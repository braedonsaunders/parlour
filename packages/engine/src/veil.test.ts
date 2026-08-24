import { describe, expect, it } from 'vitest';
import {
  applyReveals,
  dealOrder,
  hasVeiledCard,
  isVeilHandle,
  resolveVeiledState,
  stateContainsCardId,
  substituteCardIds,
  validateReveals,
  veilHandle,
  veilHandleIndex,
  veilHandles,
  veiledDeckOrder,
  type VeilSupport,
} from './veil';
import { makeRng } from './rng';
import { stdDeck } from './types';

const DECK = stdDeck();

function board() {
  return {
    hands: [
      ['v#0', 'v#2'],
      ['v#1', 'v#3'],
    ],
    stock: ['v#5', 'v#6'],
    discard: ['S12'],
    drawnFromDiscard: null as string | null,
    pickups: [{ seat: 1, card: 'S12' }],
    turn: 0,
  };
}

describe('veil handles', () => {
  it('mints and parses positional handles', () => {
    expect(veilHandle(0)).toBe('v#0');
    expect(veilHandle(51)).toBe('v#51');
    expect(veilHandleIndex('v#51')).toBe(51);
    expect(veilHandleIndex('S12')).toBeNull();
    expect(isVeilHandle('v#7')).toBe(true);
    expect(isVeilHandle('H7')).toBe(false);
  });

  it('rejects malformed handle indices instead of coercing them', () => {
    expect(veilHandleIndex('v#')).toBeNull();
    expect(veilHandleIndex('v#01')).toBeNull();
    expect(veilHandleIndex('v#1.5')).toBeNull();
    expect(veilHandleIndex('v#-3')).toBeNull();
    expect(veilHandleIndex('v# 3')).toBeNull();
    expect(() => veilHandle(-1)).toThrow();
    expect(() => veilHandle(1.5)).toThrow();
  });

  it('builds a full opaque deck order', () => {
    const handles = veilHandles(52);
    expect(handles).toHaveLength(52);
    expect(new Set(handles).size).toBe(52);
    expect(handles[51]).toBe('v#51');
  });

  it('detects veiled cards in a zone', () => {
    expect(hasVeiledCard(['S12', 'v#3'])).toBe(true);
    expect(hasVeiledCard(['S12', 'H4'])).toBe(false);
  });
});

describe('substituteCardIds', () => {
  it('replaces handles anywhere in the state tree', () => {
    const before = board();
    const after = substituteCardIds(before, new Map([['v#2', 'D9']]));
    expect(after.hands[0]).toEqual(['v#0', 'D9']);
    expect(after.hands[1]).toEqual(['v#1', 'v#3']);
  });

  it('replaces handles held in scalars and nested records', () => {
    const before = { ...board(), drawnFromDiscard: 'v#5', pickups: [{ seat: 0, card: 'v#5' }] };
    const after = substituteCardIds(before, new Map([['v#5', 'C3']]));
    expect(after.drawnFromDiscard).toBe('C3');
    expect(after.pickups[0]?.card).toBe('C3');
  });

  it('keeps untouched subtrees identical so hashing and memoisation stay cheap', () => {
    const before = board();
    const after = substituteCardIds(before, new Map([['v#0', 'S1']]));
    expect(after).not.toBe(before);
    expect(after.hands[1]).toBe(before.hands[1]);
    expect(after.pickups).toBe(before.pickups);
  });

  it('is a no-op for an empty mapping', () => {
    const before = board();
    expect(substituteCardIds(before, new Map())).toBe(before);
  });
});

describe('stateContainsCardId', () => {
  it('finds ids in arrays, scalars and nested records', () => {
    const state = board();
    expect(stateContainsCardId(state, 'v#3')).toBe(true);
    expect(stateContainsCardId(state, 'S12')).toBe(true);
    expect(stateContainsCardId(state, 'H4')).toBe(false);
  });
});

describe('validateReveals', () => {
  const state = board();

  it('accepts a well-formed opening', () => {
    expect(validateReveals(state, [['v#0', 'H4']])).toBeNull();
  });

  it('rejects openings of handles that are not in play', () => {
    expect(validateReveals(state, [['v#99', 'H4']])?.code).toBe('unknown-handle');
  });

  it('rejects minting a card the table can already see', () => {
    expect(validateReveals(state, [['v#0', 'S12']])?.code).toBe('card-already-open');
  });

  it('rejects opening a handle to another handle', () => {
    expect(validateReveals(state, [['v#0', 'v#9']])?.code).toBe('reveal-to-handle');
  });

  it('rejects non-handle sources', () => {
    expect(validateReveals(state, [['S12', 'H4']])?.code).toBe('not-a-handle');
  });

  it('rejects duplicate handles and duplicate faces in one move', () => {
    expect(
      validateReveals(state, [
        ['v#0', 'H4'],
        ['v#0', 'H5'],
      ])?.code,
    ).toBe('duplicate-reveal');
    expect(
      validateReveals(state, [
        ['v#0', 'H4'],
        ['v#1', 'H4'],
      ])?.code,
    ).toBe('duplicate-card');
  });

  it('rejects malformed pairs', () => {
    expect(validateReveals(state, [['v#0'] as unknown as [string, string]])?.code).toBe(
      'bad-reveal',
    );
    expect(validateReveals(state, [['v#0', ''] as [string, string]])?.code).toBe('bad-reveal');
  });
});

describe('applyReveals and resolveVeiledState', () => {
  it('opens handles in place', () => {
    const after = applyReveals(board(), [['v#0', 'H4']]);
    expect(after.hands[0]).toEqual(['H4', 'v#2']);
  });

  it('overlays only faces that are still in play', () => {
    const known = new Map([
      ['v#0', 'H4'],
      ['v#40', 'C7'],
    ]);
    const resolved = resolveVeiledState(board(), known);
    expect(resolved.hands[0]).toEqual(['H4', 'v#2']);
    expect(JSON.stringify(resolved)).not.toContain('C7');
  });

  it('ignores nonsense overlay entries', () => {
    const resolved = resolveVeiledState(
      board(),
      new Map([
        ['S12', 'H4'],
        ['v#0', 'v#9'],
      ]),
    );
    expect(resolved.hands[0]).toEqual(['v#0', 'v#2']);
  });
});

describe('dealOrder', () => {
  it('shuffles with the seeded rng when the room is open', () => {
    const order = dealOrder({ rng: makeRng(7) }, DECK);
    expect(order).toHaveLength(52);
    expect(new Set(order).size).toBe(52);
    expect(order).toEqual(dealOrder({ rng: makeRng(7) }, DECK));
  });

  it('uses the ceremony order verbatim when the room is veiled', () => {
    const deckOrder = veilHandles(52);
    expect(dealOrder({ rng: makeRng(7), deckOrder }, DECK)).toEqual(deckOrder);
  });

  it('refuses a ceremony order that does not match the deck size', () => {
    expect(() => dealOrder({ rng: makeRng(1), deckOrder: veilHandles(10) }, DECK)).toThrow(
      /expected 52/,
    );
  });
});

describe('veiledDeckOrder', () => {
  const support: VeilSupport = {
    deck: () => DECK,
    publicSetupFrom: (seats) => seats * 3,
    publicSetupReady: (opened) => opened.length >= 1,
  };

  it('splices publicly opened setup cards into the opaque order', () => {
    const order = veiledDeckOrder(support, 2, ['S12']);
    expect(order).toHaveLength(52);
    expect(order[6]).toBe('S12');
    expect(order[5]).toBe('v#5');
    expect(order[7]).toBe('v#7');
  });

  it('refuses to deal before the room has opened enough setup cards', () => {
    expect(() => veiledDeckOrder(support, 2, [])).toThrow(/more public openings/);
  });

  it('refuses openings that fall outside the deck', () => {
    const overflowing: VeilSupport = { ...support, publicSetupFrom: () => 60 };
    expect(() => veiledDeckOrder(overflowing, 2, ['S12'])).toThrow(/outside the deck/);
  });
});
