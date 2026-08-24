import type { CardId } from '@parlour/engine';
import { rankOf, suitOf, sumValues } from './cards';

/**
 * Cribbage scoring — the show (hand + crib) and pegging combos. Pure and
 * exhaustive: every point in the game flows through these functions, so they
 * carry canonical vectors (the 29 hand included) in score.test.ts.
 */

export type ScoreReason = 'fifteen' | 'pair' | 'trip' | 'quad' | 'run' | 'flush' | 'nobs';

export interface ScoreEntry {
  reason: ScoreReason;
  points: number;
  cards: readonly CardId[];
}

export interface ShowScore {
  total: number;
  entries: readonly ScoreEntry[];
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      out.push(current.slice());
      return;
    }
    for (let index = start; index < items.length; index++) {
      current.push(items[index] as T);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

/** Every pair of same-rank cards scores 2; trips/quads fall out naturally. */
export function scorePairs(cards: readonly CardId[]): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      if (rankOf(cards[a] as CardId) === rankOf(cards[b] as CardId)) {
        entries.push({
          reason: 'pair',
          points: 2,
          cards: [cards[a] as CardId, cards[b] as CardId],
        });
      }
    }
  }
  return entries;
}

/** Every subset summing to exactly 15 scores 2. */
export function scoreFifteens(cards: readonly CardId[]): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  for (let size = 2; size <= cards.length; size++) {
    for (const combo of combinations(cards, size)) {
      if (sumValues(combo) === 15) {
        entries.push({ reason: 'fifteen', points: 2, cards: combo });
      }
    }
  }
  return entries;
}

/**
 * Runs score per card: distinct consecutive ranks, size ≥ 3, each run
 * multiplied by the product of its ranks' multiplicities (double/triple runs).
 * Only maximal runs count — the longest sequence absorbs shorter overlaps.
 */
export function scoreRuns(cards: readonly CardId[]): ScoreEntry[] {
  const byRank = new Map<number, CardId[]>();
  for (const card of cards) {
    const rank = rankOf(card);
    byRank.set(rank, [...(byRank.get(rank) ?? []), card]);
  }

  let bestStart = -1;
  let bestLength = 0;
  let run = false;
  let cursor = 0;
  // find the maximal contiguous band of present ranks
  for (let rank = 1; rank <= 13; rank++) {
    if (byRank.has(rank)) {
      if (!run) {
        run = true;
        cursor = rank;
      }
    } else if (run) {
      const length = rank - cursor;
      if (length > bestLength) {
        bestLength = length;
        bestStart = cursor;
      }
      run = false;
    }
  }
  if (run) {
    const length = 14 - cursor;
    if (length > bestLength) {
      bestLength = length;
      bestStart = cursor;
    }
  }
  if (bestLength < 3) return [];

  const multiplierProduct = Array.from({ length: bestLength }, (_, offset) => {
    const group = byRank.get(bestStart + offset);
    return group ?? [];
  });
  const points =
    bestLength * multiplierProduct.reduce((product, group) => product * group.length, 1);
  const runCards = multiplierProduct.flat();
  return [{ reason: 'run', points, cards: runCards }];
}

export function isFourCardFlush(hand: readonly CardId[]): boolean {
  if (hand.length !== 4) return false;
  const suit = suitOf(hand[0] as CardId);
  return hand.every((card) => suitOf(card) === suit);
}

/**
 * Flushes: a four-card flush in the HAND scores 4, plus 1 when the starter
 * matches (five total). In the CRIB only an all-five flush counts.
 */
export function scoreFlush(
  hand: readonly CardId[],
  starter: CardId,
  isCrib: boolean,
): ScoreEntry[] {
  if (!isFourCardFlush(hand)) return [];
  const suit = suitOf(starter);
  const fiveFlush = hand.every((card) => suitOf(card) === suit);
  if (isCrib) {
    return fiveFlush ? [{ reason: 'flush', points: 5, cards: [...hand, starter] }] : [];
  }
  return [
    {
      reason: 'flush',
      points: fiveFlush ? 5 : 4,
      cards: fiveFlush ? [...hand, starter] : [...hand],
    },
  ];
}

/** His nobs — a jack of the starter's suit, worth 1. */
export function hasNobs(hand: readonly CardId[], starter: CardId): boolean {
  const suit = suitOf(starter);
  return hand.some((card) => rankOf(card) === 11 && suitOf(card) === suit);
}

/**
 * Scores one show segment (a 4-card hand or the crib, plus the starter).
 * His heels is a cut event, not part of any hand, so it lives elsewhere.
 */
export function scoreShow(
  hand: readonly CardId[],
  starter: CardId,
  options: { isCrib?: boolean } = {},
): ShowScore {
  const all = [...hand, starter];
  const entries: ScoreEntry[] = [
    ...scoreFifteens(all),
    ...scorePairs(all),
    ...scoreRuns(all),
    ...scoreFlush(hand, starter, options.isCrib === true),
  ];
  if (hasNobs(hand, starter)) {
    entries.push({
      reason: 'nobs',
      points: 1,
      cards: all.filter((card) => rankOf(card) === 11 && suitOf(card) === suitOf(starter)),
    });
  }
  return { total: entries.reduce((total, entry) => total + entry.points, 0), entries };
}

// ---------------------------------------------------------------------------
// Pegging (the play)
// ---------------------------------------------------------------------------

export interface PegScore {
  points: number;
  reasons: readonly ('fifteen' | 'pair' | 'trip' | 'quad' | 'run' | 'thirtyone')[];
}

const PAIR_SIZE_POINTS: Record<number, number> = { 2: 2, 3: 6, 4: 12 };

/**
 * Points earned by playing `card` onto `pile` (cards already on the table this
 * sequence, in play order). Fifteens come off the running count, pairs off
 * trailing equal ranks, runs off the trailing window regardless of order, and
 * hitting exactly 31 scores 2.
 */
export function pegPlayScore(pile: readonly CardId[], card: CardId): PegScore {
  const played = [...pile, card];
  const count = sumValues(played);
  const reasons: ('fifteen' | 'pair' | 'trip' | 'quad' | 'run' | 'thirtyone')[] = [];
  let points = 0;

  if (count === 15) {
    points += 2;
    reasons.push('fifteen');
  }
  if (count === 31) {
    points += 2;
    reasons.push('thirtyone');
  }

  const lastRank = rankOf(card);
  let sameRank = 0;
  for (let index = pile.length - 1; index >= 0; index--) {
    if (rankOf(pile[index] as CardId) !== lastRank) break;
    sameRank += 1;
  }
  const pairSize = sameRank + 1;
  const pairPoints = PAIR_SIZE_POINTS[pairSize];
  if (pairPoints) {
    points += pairPoints;
    reasons.push(pairSize === 2 ? 'pair' : pairSize === 3 ? 'trip' : 'quad');
  }

  const run = trailingRun(played);
  if (run >= 3) {
    points += run;
    reasons.push('run');
  }

  return { points, reasons };
}

/** Longest suffix of `played` whose distinct ranks form a consecutive set ≥ 3. */
function trailingRun(played: readonly CardId[]): number {
  const seen = new Set<number>();
  for (let size = Math.min(played.length, 7); size >= 3; size--) {
    seen.clear();
    for (let index = played.length - size; index < played.length; index++) {
      seen.add(rankOf(played[index] as CardId));
    }
    if (seen.size !== size) continue;
    const min = Math.min(...seen);
    const max = Math.max(...seen);
    if (max - min === size - 1) return size;
  }
  return 0;
}
