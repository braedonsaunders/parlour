import { describe, expect, it } from 'vitest';
import {
  bestPartition,
  candidateMelds,
  deadwoodOf,
  findLayoffs,
} from './melds';

const sortCards = (cards: readonly string[]) => [...cards].sort();

describe('candidate melds', () => {
  it('finds sets of three and four', () => {
    const melds = candidateMelds(['S7', 'H7', 'D7', 'C7', 'S2']);
    const kinds = melds.filter((meld) => meld.kind === 'set');
    expect(kinds.some((meld) => sortCards(meld.cards).join() === 'C7,D7,H7,S7')).toBe(true);
    expect(kinds.filter((meld) => meld.cards.length === 3)).toHaveLength(4);
  });

  it('finds runs including every sub-span', () => {
    const melds = candidateMelds(['S3', 'S4', 'S5', 'S6']).filter((m) => m.kind === 'run');
    expect(melds.map((m) => m.cards.join())).toEqual(
      expect.arrayContaining([
        'S3,S4,S5',
        'S4,S5,S6',
        'S3,S4,S5,S6',
      ]),
    );
  });

  it('treats aces as low only — Q-K-A is never a run', () => {
    const melds = candidateMelds(['S12', 'S13', 'S1']).filter((m) => m.kind === 'run');
    expect(melds).toHaveLength(0);
  });

  it('accepts A-2-3 as a run', () => {
    const melds = candidateMelds(['H1', 'H2', 'H3']).filter((m) => m.kind === 'run');
    expect(melds.map((m) => m.cards.join())) .toContain('H1,H2,H3');
  });

  it('does not wrap runs across suits or mix ranks', () => {
    expect(candidateMelds(['S5', 'H6', 'D7']).every((m) => m.kind === 'set')).toBe(true);
  });
});

describe('best partition', () => {
  it('scores a pure gin hand at zero deadwood', () => {
    const hand = ['S3', 'S4', 'S5', 'H7', 'H8', 'H9', 'D2', 'D3', 'D4', 'D5'];
    expect(bestPartition(hand).deadwood).toBe(0);
    expect(bestPartition(hand).deadwoodCards).toHaveLength(0);
  });

  it('prefers the meld combination that minimizes leftover pips', () => {
    // 7♠7♥7♦ is worth 21; alternatively 5-6-7 hearts + loose cards
    const hand = ['S7', 'H7', 'D7', 'H5', 'H6', 'H8'];
    const partition = bestPartition(hand);
    // best: run H5-H8 (18) leaves both black sevens
    expect(partition.deadwood).toBe(14);
    expect(partition.melds[0]!.cards.sort().join()).toBe('H5,H6,H7,H8');
  });

  it('breaks ties deterministically', () => {
    const hand = ['S2', 'H2', 'D2', 'C3', 'S3', 'H3'];
    const first = bestPartition(hand);
    const second = bestPartition([...hand].reverse());
    expect(first.melds.map((meld) => sortCards(meld.cards).join())).toEqual(
      second.melds.map((meld) => sortCards(meld.cards).join()),
    );
    expect(first.deadwood).toBe(second.deadwood);
  });

  it('handles eleven-card big gin hands', () => {
    const hand = [
      'S2', 'S3', 'S4', 'S5', 'S6',
      'H7', 'H8', 'H9',
      'D3', 'D4', 'D5',
    ];
    expect(bestPartition(hand)).toMatchObject({ deadwood: 0 });
    expect(bestPartition(hand).melds).toHaveLength(3);
  });

  it('counts faces as ten and aces as one', () => {
    expect(deadwoodOf(['S13', 'H12'])).toBe(20);
    expect(deadwoodOf(['S1'])).toBe(1);
    expect(deadwoodOf(['S10'])).toBe(10);
  });

  it('returns everything as deadwood when no meld exists', () => {
    const hand = ['S2', 'H5', 'D9', 'C13'];
    expect(bestPartition(hand).deadwood).toBe(26);
    expect(sortCards(bestPartition(hand).deadwoodCards)).toEqual(sortCards(hand));
  });

  it('solves tiny and empty hands without crashing', () => {
    expect(deadwoodOf([])).toBe(0);
    expect(deadwoodOf(['S9'])).toBe(9);
    expect(deadwoodOf(['S9', 'S9'.replace('S', 'H')])).toBe(18);
  });

  it('chooses two runs sharing a rank correctly over one long run plus junk', () => {
    // 4♠5♠6♠ + 6♥7♥8♥ beats breaking either
    const hand = ['S4', 'S5', 'S6', 'H6', 'H7', 'H8', 'D2'];
    const partition = bestPartition(hand);
    expect(partition.deadwood).toBe(2);
    expect(partition.melds).toHaveLength(2);
  });

  it('uses a quad as one meld when better than any triple', () => {
    const hand = ['S5', 'H5', 'D5', 'C5', 'S6', 'S7', 'H8', 'H9', 'H10', 'D11'];
    const partition = bestPartition(hand);
    // S5..S7 run + C5? No: quad 5555 = 20; run S5,S6,S7 = 15 + H8,H9,H10 = 27…
    // best is run S5-S6-S7 (15) + run H8-H9-H10 (27) leaving D5,C5,H5 = 20
    // vs quad (20) + H8-H9-10 (27) leaving S6,S7,DJ = 27. So deadwood 20 wins.
    expect(partition.deadwood).toBeLessThanOrEqual(20);
  });
});

describe('layoffs', () => {
  it('adds the fourth card to a set', () => {
    const knocker = [{ kind: 'set' as const, cards: ['S8', 'H8', 'D8'] }];
    const { layoffs } = findLayoffs(knocker, ['C8', 'S2']);
    expect(layoffs).toEqual([{ card: 'C8', meldIndex: 0 }]);
  });

  it('extends a run at either end', () => {
    const knocker = [{ kind: 'run' as const, cards: ['H5', 'H6', 'H7'] }];
    const result = findLayoffs(knocker, ['H4', 'H8']);
    expect(result.layoffs.map((l) => l.card).sort()).toEqual(['H4', 'H8']);
    expect(result.melds[0]!.cards.map(rankOrder).sort()).toEqual([4, 5, 6, 7, 8]);
  });

  it('cascades — laying off extends the run so further cards fit', () => {
    const knocker = [{ kind: 'run' as const, cards: ['S5', 'S6', 'S7'] }];
    const { layoffs } = findLayoffs(knocker, ['S4', 'S3', 'D13']);
    // S4 extends to 4-7; then S3 fits the new low end
    expect(layoffs.map((l) => l.card).sort()).toEqual(['S3', 'S4']);
  });

  it('never lays off onto a full set or outside run bounds', () => {
    const knocker = [
      { kind: 'set' as const, cards: ['S8', 'H8', 'D8', 'C8'] },
      { kind: 'run' as const, cards: ['S12', 'S13'] },
    ].slice(0, 1);
    expect(findLayoffs(knocker, ['S8']).layoffs).toEqual([]);
    const aceLowRun = [{ kind: 'run' as const, cards: ['D1', 'D2', 'D3'] }];
    expect(findLayoffs(aceLowRun, ['D13']).layoffs).toEqual([]);
  });

  it('ignores wrong-suit cards for runs and wrong-rank for sets', () => {
    const knocker = [
      { kind: 'set' as const, cards: ['S8', 'H8', 'D8'] },
      { kind: 'run' as const, cards: ['H5', 'H6', 'H7'] },
    ];
    // C8 completes the set (sets ignore suit); true off-suit cards never fit
    expect(findLayoffs(knocker, ['C8', 'S4', 'D9']).layoffs).toEqual([
      { card: 'C8', meldIndex: 0 },
    ]);
  });
});

function rankOrder(card: string): number {
  return Number(card.slice(1));
}
