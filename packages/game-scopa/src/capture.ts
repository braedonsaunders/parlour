import type { CardId } from '@parlour/engine';
import { captureValue } from './cards';

export interface CaptureOption {
  card: CardId;
  /**
   * Table cards taken alongside `card`; empty for a pose. Single-card takes
   * and sum combinations are separate options — choosing between identical
   * singletons is the player's decision, so each is its own entry.
   */
  take: readonly CardId[];
}

const compareIds = (left: CardId, right: CardId): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Table cards whose value equals `value` exactly. */
export function singleMatches(value: number, table: readonly CardId[]): CardId[] {
  return table.filter((card) => captureValue(card) === value);
}

/**
 * Distinct table subsets of two or more cards summing to `value`. Combinatorial
 * DFS over value-sorted entries with suffix-sum pruning; output is ordered by
 * subset size, then ids, so callers see a stable list.
 */
export function sumCombinations(value: number, table: readonly CardId[]): CardId[][] {
  const entries = table
    .map((id) => ({ id, v: captureValue(id) }))
    .sort((a, b) => a.v - b.v || compareIds(a.id, b.id));
  const n = entries.length;
  const values = entries.map((entry) => entry.v);
  const suffix = new Array<number>(n + 1);
  suffix[n] = 0;
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1]! + values[i]!;

  const found: CardId[][] = [];
  const picked: CardId[] = [];
  const walk = (start: number, sum: number): void => {
    if (sum === value) {
      if (picked.length >= 2) found.push([...picked]);
      return;
    }
    // every remaining card only adds — once the rest cannot reach, stop
    if (start === n || sum + suffix[start]! < value) return;
    for (let i = start; i < n; i++) {
      const next = sum + values[i]!;
      if (next > value) break; // values ascend within this loop
      picked.push(entries[i]!.id);
      walk(i + 1, next);
      picked.pop();
    }
  };
  walk(0, 0);
  return found.sort((a, b) => a.length - b.length || compareIds(a.join(','), b.join(',')));
}

/**
 * Every legal way to play each hand card against the table. A single-card
 * match forces capture, so when one exists no pose and no combination is
 * offered for that card.
 */
export function captureOptions(hand: readonly CardId[], table: readonly CardId[]): CaptureOption[] {
  const options: CaptureOption[] = [];
  for (const card of hand) {
    const value = captureValue(card);
    const singles = singleMatches(value, table);
    if (singles.length > 0) {
      for (const single of singles) options.push({ card, take: [single] });
      continue;
    }
    for (const combo of sumCombinations(value, table)) options.push({ card, take: combo });
    // posing stays legal when no singleton matches, even with sums available
    options.push({ card, take: [] });
  }
  return options;
}

/** Largest table worth worrying about: ten cards of value 10. */
const MAX_SUM = 100;

/**
 * Values an opponent could capture off this table with ONE hand card:
 * every singleton value present, plus every subset sum reachable with two or
 * more cards. Bots use it to judge what a pose leaves behind.
 */
export function takeableValues(table: readonly CardId[]): Set<number> {
  let any = new Set<number>([0]);
  let pairsPlus = new Set<number>();
  for (const card of table) {
    const v = captureValue(card);
    const nextAny = new Set(any);
    const nextPairs = new Set(pairsPlus);
    for (const s of any) {
      const t = s + v;
      if (t > MAX_SUM) continue;
      nextAny.add(t);
      if (s > 0) nextPairs.add(t); // extending a non-empty prefix reaches size ≥ 2
    }
    for (const s of pairsPlus) {
      const t = s + v;
      if (t <= MAX_SUM) nextPairs.add(t);
    }
    any = nextAny;
    pairsPlus = nextPairs;
  }
  const singles = new Set(table.map((card) => captureValue(card)));
  return new Set([...singles, ...pairsPlus]);
}

/** Total pip value of a group of cards — the whole-table sum is scopa bait. */
export function sumValues(cards: readonly CardId[]): number {
  return cards.reduce((total, card) => total + captureValue(card), 0);
}
