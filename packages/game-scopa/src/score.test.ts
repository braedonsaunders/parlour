import { describe, expect, it } from 'vitest';
import type { CardId } from '@parlour/engine';
import { scopaConfig } from './config';
import {
  matchOver,
  matchResultFor,
  napolaRun,
  primieraTotal,
  primieraValue,
  scoreRound,
  type RoundScoreInput,
} from './score';
import type { ScopaRules } from './config';

const rules = (overrides: Partial<ScopaRules> = {}): Pick<ScopaRules, 'napola' | 'reDenari'> => ({
  napola: overrides.napola ?? false,
  reDenari: overrides.reDenari ?? false,
});

function round(
  seats: number,
  capturesBySeat: readonly CardId[][],
  scopeBySeat?: readonly number[],
  ruleOverrides?: Partial<ScopaRules>,
) {
  const input: RoundScoreInput = {
    seats,
    capturesBySeat: [...capturesBySeat],
    scopeBySeat: scopeBySeat ?? new Array<number>(seats).fill(0),
    rules: rules(ruleOverrides),
  };
  return scoreRound(input);
}

/** Deterministic non-coin filler for pile sizing. */
function filler(count: number): CardId[] {
  const suits = ['C', 'S', 'B'];
  return Array.from({ length: count }, (_, i) => `${suits[i % 3]}${(Math.floor(i / 3) % 7) + 2}`);
}

describe('primiera — the canonical table', () => {
  it('values each pip rank exactly as written', () => {
    const expected = [16, 12, 13, 14, 15, 18, 21, 10, 10, 10];
    expected.forEach((value, index) => {
      expect(primieraValue(index + 1)).toBe(value);
    });
    expect(primieraValue(11)).toBe(0);
  });

  it('takes the best card of each suit and sums', () => {
    // denari 7→21, coppe 2→12, spade 1→16, bastoni 6→18
    expect(primieraTotal(['D7', 'D5', 'C2', 'S1', 'B6'])).toBe(21 + 12 + 16 + 18);
    // faces never beat numerals: 8/9/10 all count 10
    expect(primieraTotal(['D10', 'C9', 'S8', 'B7'])).toBe(10 + 10 + 10 + 21);
    // only each suit's BEST card counts — extra low cards add nothing
    expect(primieraTotal(['D7', 'D1', 'C2'])).toBeNull(); // spade/bastoni void
  });

  it('excludes a player void in any suit', () => {
    expect(primieraTotal(['D7', 'C7', 'S7'])).toBeNull();
    expect(primieraTotal([])).toBeNull();
    expect(primieraTotal(['D1', 'C1', 'B1', 'S1'])).toBe(64);
  });
});

describe('carte / denari / settebello', () => {
  it('awards most cards, most coins and the settebello to the leader', () => {
    const won = round(2, [['D7', ...filler(20)], ['S1']]);
    expect(won.awards).toContainEqual({ kind: 'carte', owner: 0, points: 1 });
    expect(won.awards).toContainEqual({ kind: 'denari', owner: 0, points: 1 });
    expect(won.awards).toContainEqual({ kind: 'settebello', owner: 0, points: 1 });
  });

  it('scores nobody on a carte tie (20–20)', () => {
    const tied = round(2, [filler(20), ['D1', ...filler(19)]]);
    expect(tied.owners[0]!.cards).toBe(20);
    expect(tied.owners[1]!.cards).toBe(20);
    expect(tied.awards.filter((a) => a.kind === 'carte')).toEqual([]);
  });

  it('scores nobody on a denari tie (5–5)', () => {
    const tied = round(2, [
      ['D1', 'D3', 'D5', 'D7', 'D9'],
      ['D2', 'D4', 'D6', 'D8', 'D10'],
    ]);
    expect(tied.awards.filter((a) => a.kind === 'denari')).toEqual([]);
  });

  it('gives the settebello to exactly its capturer, always 1 point', () => {
    const result = round(2, [['C1'], ['D7']]);
    expect(result.awards.filter((a) => a.kind === 'settebello')).toEqual([
      { kind: 'settebello', owner: 1, points: 1 },
    ]);
  });
});

describe('the primiera award', () => {
  it('goes to the highest eligible total', () => {
    const win = round(2, [
      ['D7', 'C7', 'S7', 'B7'], // 84
      ['D6', 'C6', 'S6', 'B6'], // 72
    ]);
    expect(win.awards.filter((a) => a.kind === 'primiera')).toEqual([
      { kind: 'primiera', owner: 0, points: 1 },
    ]);
  });

  it('ties score nobody', () => {
    // 57 = 21+12+12+12 = 16+16+12+13 — equal totals from disjoint cards
    const tie = round(2, [
      ['D7', 'C2', 'S2', 'B2'],
      ['D1', 'C1', 'S2', 'B3'],
    ]);
    expect(tie.owners[0]!.primiera).toBe(57);
    expect(tie.owners[1]!.primiera).toBe(57);
    expect(tie.awards.filter((a) => a.kind === 'primiera')).toEqual([]);
  });

  it('excludes void hands entirely rather than scoring them zero', () => {
    const result = round(2, [
      ['C2', 'C3'], // void in three suits — cannot win even against a weak field
      ['D5', 'C5', 'S5', 'B5'], // 15×4 = 60
    ]);
    expect(result.owners[0]!.primiera).toBeNull();
    expect(result.awards.filter((a) => a.kind === 'primiera')).toEqual([
      { kind: 'primiera', owner: 1, points: 1 },
    ]);
  });
});

describe('partnership pooling at four and six seats', () => {
  it('pools partner cards per suit for primiera at four seats', () => {
    const pooled = round(
      4,
      [
        ['D7', 'C7'], // seat 0 holds two suits' sevens
        [], // seat 1 poses all round but shares the credit
        ['S7', 'B7'], // partner holds the other two
        ['D1', 'C1', 'S1', 'B1'],
      ],
      [1, 0, 2, 0],
    );
    expect(pooled.owners[0]!.primiera).toBe(84); // neither partner held four suits alone
    expect(pooled.owners[0]!.scope).toBe(3); // partners' scope pool too
    expect(pooled.owners[1]!.cards).toBe(4);
    expect(pooled.awards.filter((a) => a.kind === 'primiera')).toEqual([
      { kind: 'primiera', owner: 0, points: 1 },
    ]);
  });

  it('credits team-level carte/denari/settebello at six seats', () => {
    const result = round(
      6,
      [['D7', 'C1'], ['D1', 'C2'], [], ['S1'], ['B1'], []],
      [1, 0, 0, 0, 1, 0],
    );
    expect(result.owners[0]!.cards).toBe(3); // evens: seats 0, 2, 4
    expect(result.owners[0]!.denari).toBe(1);
    expect(result.owners[0]!.scope).toBe(2); // seats 0 and 4 each swept once
    expect(result.owners[1]!.cards).toBe(3); // odds: seats 1, 3, 5
    expect(result.awards.find((a) => a.kind === 'settebello')?.owner).toBe(0);
  });
});

describe('napola and re-denari toggles', () => {
  it('scores the coin run from ace-2-3 onward only when enabled', () => {
    expect(napolaRun(['D1', 'D2', 'D3', 'D4', 'D5'])).toBe(5);
    expect(napolaRun(['D1', 'D2'])).toBe(0);
    expect(napolaRun(['D2', 'D3', 'D4'])).toBe(0);
    expect(napolaRun(['D1', 'D2', 'D3', 'D5', 'D6'])).toBe(3);

    const on = round(2, [['D1', 'D2', 'D3', 'D4']], undefined, { napola: true });
    expect(on.awards).toContainEqual({ kind: 'napola', owner: 0, points: 4 });
    const off = round(2, [['D1', 'D2', 'D3', 'D4']], undefined, { napola: false });
    expect(off.awards.filter((a) => a.kind === 'napola')).toEqual([]);
  });

  it('gives one bonus point for the King of coins when enabled', () => {
    const on = round(2, [['D10']], undefined, { reDenari: true });
    expect(on.awards).toContainEqual({ kind: 're-denari', owner: 0, points: 1 });
    const off = round(2, [['D10']], undefined, { reDenari: false });
    expect(off.awards.filter((a) => a.kind === 're-denari')).toEqual([]);
  });

  it('pools a napola across partners the same as every other punto', () => {
    const split = round(
      4,
      [
        ['D1', 'D2'], // seat 0
        [], // seat 1 (opponent)
        ['D3', 'D4'], // seat 2 — seat 0's partner
        [],
      ],
      undefined,
      { napola: true },
    );
    // captures are pooled per team before scoring, so the run reads 1-2-3-4
    expect(split.owners[0]!.napolaRun).toBe(4);
    expect(split.owners[1]!.napolaRun).toBe(0);
    expect(split.awards).toContainEqual({ kind: 'napola', owner: 0, points: 4 });
  });
});

describe('scope points', () => {
  it('flow into the owner delta one-for-one', () => {
    const result = round(2, [['C1'], []], [3, 1]);
    expect(result.owners[0]!.scope).toBe(3);
    expect(result.owners[1]!.scope).toBe(1);
    expect(result.deltas[0]).toBeGreaterThanOrEqual(3);
    expect(result.deltas[1]).toBeGreaterThanOrEqual(1);
  });
});

describe('match line', () => {
  it('ends only above target with a unique leader; ties play on', () => {
    expect(matchOver([10, 11], 11)).toEqual({ winner: 1 });
    expect(matchOver([12, 11], 11)).toEqual({ winner: 0 });
    expect(matchOver([11, 11], 11)).toBeNull();
    expect(matchOver([9, 5], 11)).toBeNull();
  });

  it('ranks seats by their owner at partnership sizes', () => {
    const result = matchResultFor({
      rules: scopaConfig.resolve({}),
      seats: 4,
      scores: [12, 7],
    });
    expect(result?.winner).toBe(0);
    expect(result?.rankings.map((r) => r.rank)).toEqual([1, 2, 1, 2]);
    expect(result?.reason).toBe('first to 11');
  });

  it('ranks losing individuals behind the winner at three seats', () => {
    const result = matchResultFor({
      rules: scopaConfig.resolve({ target: 11 }),
      seats: 3,
      scores: [8, 12, 3],
    });
    expect(result?.rankings.map((r) => r.rank)).toEqual([2, 1, 3]);
  });
});
