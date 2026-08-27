import { describe, expect, it } from 'vitest';
import { palaceGame } from './game';
import { ctx, fxKinds, state } from './test-util';

const moves = palaceGame.moves;

describe('swap', () => {
  it('conserves every card while trading hand cards for face-up cards', () => {
    const s = state({
      hands: [['S3', 'H4', 'D5'], ['C6']],
      up: [['S9', 'H10', 'C11'], ['S2']],
      readied: [],
    });
    const verdict = moves.swap!.validate(s, 0, { pairs: [{ hand: 'S3', up: 'S9' }] });
    expect(verdict).toBe(true);
    const outcome = moves.swap!.apply(s, 0, { pairs: [{ hand: 'S3', up: 'S9' }] }, ctx());
    expect(outcome.hands[0]).toEqual(['S9', 'H4', 'D5']);
    expect(outcome.up[0]).toEqual(['S3', 'H10', 'C11']);
    expect(outcome.swapped).toEqual([0]);
    const before = [...s.hands[0]!, ...s.up[0]!].sort();
    const after = [...outcome.hands[0]!, ...outcome.up[0]!].sort();
    expect(after).toEqual(before);
  });

  it('emits a swap fx with the pair count', () => {
    const s = state({ hands: [['S3']], up: [['S9']], readied: [] });
    const c = ctx();
    moves.swap!.apply(s, 0, { pairs: [{ hand: 'S3', up: 'S9' }] }, c);
    expect(fxKinds(c)).toContain('palace.swap');
  });

  it('rejects a second swap from the same seat', () => {
    const s = state({ hands: [['S3']], up: [['S9']], readied: [], swapped: [0] });
    const verdict = moves.swap!.validate(s, 0, { pairs: [] });
    expect((verdict as { code: string }).code).toBe('already-swapped');
  });

  it('rejects a hand card the seat does not hold', () => {
    const s = state({ hands: [['S3']], up: [['S9']], readied: [] });
    const verdict = moves.swap!.validate(s, 0, { pairs: [{ hand: 'H4', up: 'S9' }] });
    expect((verdict as { code: string }).code).toBe('not-in-hand');
  });
});

describe('ready', () => {
  it('seats every seat before opening the starter turn', () => {
    const s = state({ hands: [['S3'], ['S4']], readied: [] });
    const first = moves.ready!.apply(s, 0, undefined, ctx(0));
    expect(first.turn).toBeNull();
    expect(first.readied).toEqual([0]);
    const second = moves.ready!.apply(first, 1, undefined, ctx(1));
    expect(second.turn).not.toBeNull();
  });
});

describe('legal rank', () => {
  it('rejects a play below the pile floor', () => {
    const s = state({ hands: [['S5'], ['S3']], floor: 7, turn: 0 });
    const verdict = moves.playCards!.validate(s, 0, { cards: ['S5'] });
    expect((verdict as { code: string }).code).toBe('not-higher');
  });

  it('accepts a play equal to or above the pile floor', () => {
    const equal = state({ hands: [['S7'], ['S3']], floor: 7, turn: 0 });
    expect(moves.playCards!.validate(equal, 0, { cards: ['S7'] })).toBe(true);
    const higher = state({ hands: [['S13'], ['S3']], floor: 7, turn: 0 });
    expect(moves.playCards!.validate(higher, 0, { cards: ['S13'] })).toBe(true);
  });

  it('requires the active layer — hand before face-up before face-down', () => {
    const s = state({ hands: [['S5']], up: [['H6']], turn: 0 });
    const verdict = moves.playCards!.validate(s, 0, { cards: ['H6'] });
    expect((verdict as { code: string }).code).toBe('not-in-layer');
  });

  it('rejects mixed-rank plays', () => {
    const s = state({ hands: [['S5', 'H6']], turn: 0 });
    const verdict = moves.playCards!.validate(s, 0, { cards: ['S5', 'H6'] });
    expect((verdict as { code: string }).code).toBe('mixed-ranks');
  });
});

describe('specials', () => {
  it('a 2 is always playable and resets the floor low', () => {
    const s = state({ hands: [['S2'], ['S3']], up: [['H9'], []], floor: 12, turn: 0 });
    expect(moves.playCards!.validate(s, 0, { cards: ['S2'] })).toBe(true);
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S2'] }, ctx());
    expect(outcome.floor).toBe(2);
    expect(outcome.turn).toBe(1);
    expect(moves.playCards!.validate(outcome, 1, { cards: ['S3'] })).toBe(true);
  });

  it('a 2 stays subject to the floor when twosReset is off', () => {
    const s = state({ hands: [['S2'], ['S3']], floor: 12, turn: 0 }, { twosReset: false });
    const verdict = moves.playCards!.validate(s, 0, { cards: ['S2'] });
    expect((verdict as { code: string }).code).toBe('not-higher');
  });

  it('a 10 burns the pile and grants the same seat another turn', () => {
    const s = state({
      hands: [['S10'], ['S3']],
      up: [['H9'], []],
      pile: ['H7', 'H8'],
      floor: 7,
      turn: 0,
    });
    const c = ctx();
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S10'] }, c);
    expect(outcome.pile).toEqual([]);
    expect(outcome.burn).toEqual(['H7', 'H8', 'S10']);
    expect(outcome.floor).toBeNull();
    expect(outcome.turn).toBe(0);
    expect(fxKinds(c)).toContain('palace.burn');
  });

  it('an 8 is always playable and leaves the floor untouched', () => {
    const s = state({ hands: [['S8'], ['S6']], up: [['H9'], []], floor: 7, turn: 0 });
    expect(moves.playCards!.validate(s, 0, { cards: ['S8'] })).toBe(true);
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S8'] }, ctx());
    expect(outcome.floor).toBe(7);
    const verdict = moves.playCards!.validate(outcome, 1, { cards: ['S6'] });
    expect((verdict as { code: string }).code).toBe('not-higher');
  });

  it('a pile of only 8s leaves the table open', () => {
    const s = state({ hands: [['S8'], ['S3']], up: [['H9'], []], floor: null, turn: 0 });
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S8'] }, ctx());
    expect(outcome.floor).toBeNull();
    expect(moves.playCards!.validate(outcome, 1, { cards: ['S3'] })).toBe(true);
  });

  it('four of a kind on top burns the pile and grants another turn', () => {
    const s = state({
      hands: [['S5'], ['S3']],
      up: [['H9'], []],
      pile: ['C5', 'D5', 'H5'],
      floor: 5,
      topRun: { rank: 5, count: 3 },
      turn: 0,
    });
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S5'] }, ctx());
    expect(outcome.pile).toEqual([]);
    expect(outcome.burn).toEqual(['C5', 'D5', 'H5', 'S5']);
    expect(outcome.topRun).toBeNull();
    expect(outcome.turn).toBe(0);
  });

  it('does not burn on four of a kind when the house rule is off', () => {
    const s = state(
      {
        hands: [['S5'], ['S3']],
        up: [['H9'], []],
        pile: ['C5', 'D5', 'H5'],
        floor: 5,
        topRun: { rank: 5, count: 3 },
        turn: 0,
      },
      { fourKindBurn: false },
    );
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S5'] }, ctx());
    expect(outcome.pile).toEqual(['C5', 'D5', 'H5', 'S5']);
    expect(outcome.topRun).toEqual({ rank: 5, count: 4 });
    expect(outcome.turn).toBe(1);
  });
});

describe('pickup', () => {
  it('rejects picking up an empty pile', () => {
    const s = state({ hands: [['S3'], ['S4']], pile: [], turn: 0 });
    const verdict = moves.pickup!.validate(s, 0, undefined);
    expect((verdict as { code: string }).code).toBe('pile-empty');
  });

  it('moves the whole pile into the seat’s hand and passes the turn', () => {
    const s = state({ hands: [['S3'], ['S4']], pile: ['H9', 'C9'], floor: 9, turn: 0 });
    const outcome = moves.pickup!.apply(s, 0, undefined, ctx());
    expect(outcome.hands[0]!.sort()).toEqual(['C9', 'H9', 'S3'].sort());
    expect(outcome.pile).toEqual([]);
    expect(outcome.floor).toBeNull();
    expect(outcome.turn).toBe(1);
  });
});

describe('down-card play', () => {
  it('is only legal once hand and face-up are both empty', () => {
    const s = state({ hands: [['S3']], up: [['S4']], down: [['S5']], turn: 0 });
    const verdict = moves.playDown!.validate(s, 0, { slot: 0 });
    expect((verdict as { code: string }).code).toBe('wrong-layer');
  });

  it('stays in play when the flipped card beats the pile', () => {
    const s = state({
      hands: [[], []],
      up: [[], []],
      down: [['S9', 'S2'], []],
      floor: 5,
      turn: 0,
    });
    const outcome = moves.playDown!.apply(s, 0, { slot: 0 }, ctx());
    expect(outcome.down[0]).toEqual(['S2']);
    expect(outcome.pile).toEqual(['S9']);
    expect(outcome.floor).toBe(9);
    expect(outcome.turn).toBe(1);
  });

  it('picks up the pile plus the flipped card on a miss', () => {
    const s = state({
      hands: [[], []],
      up: [[], []],
      down: [['S4', 'S2'], []],
      pile: ['H9'],
      floor: 9,
      turn: 0,
    });
    const outcome = moves.playDown!.apply(s, 0, { slot: 0 }, ctx());
    expect(outcome.hands[0]!.sort()).toEqual(['H9', 'S4']);
    expect(outcome.pile).toEqual([]);
    expect(outcome.floor).toBeNull();
    expect(outcome.turn).toBe(1);
  });
});

describe('winning a round', () => {
  it('ends the round the instant a seat empties every layer', () => {
    const s = state({
      hands: [['S9'], ['S3', 'S4']],
      up: [[], ['S5']],
      down: [[], ['S6']],
      turn: 0,
      floor: 5,
    });
    const outcome = moves.playCards!.apply(s, 0, { cards: ['S9'] }, ctx());
    expect(outcome.roundWinner).toBe(0);
    expect(outcome.roundsWon[0]).toBe(1);
    expect(outcome.lastOrder).toEqual([0, 1]);
    expect(outcome.turn).toBeNull();
  });
});
