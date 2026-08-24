import { stableCardOrder, type CardId, type HandOrder } from '@parlour/engine';
import { pipValue, rankOf, suitOf } from './cards';

// ---------------------------------------------------------------------------
// The meld/deadwood solver: best sets-and-runs partition of a gin hand,
// minimizing deadwood. Exhaustive over candidate melds with bitmask memoisation
// — hands are 10–11 cards so the search space is tiny, but bots call this
// thousands of times per simulation, so it stays allocation-light and stable.
// Aces are low only (Q-K-A is never a run); sets are 3–4 of a rank; runs are
// 3+ consecutive same-suit ranks.
// ---------------------------------------------------------------------------

export interface GinMeld {
  kind: 'set' | 'run';
  cards: CardId[];
}

export interface GinPartition {
  melds: readonly GinMeld[];
  /** unmelded cards, in ascending id order */
  deadwoodCards: readonly CardId[];
  deadwood: number;
}

interface Candidate extends GinMeld {
  mask: number;
  points: number;
}

/** All disjoint-meld candidates for the hand. Order is canonical and stable. */
export function candidateMelds(hand: readonly CardId[]): Candidate[] {
  const index = new Map<CardId, number>();
  hand.forEach((card, at) => index.set(card, at));

  const build = (kind: 'set' | 'run', cards: CardId[]): Candidate | null => {
    let mask = 0;
    for (const card of cards) {
      const bit = index.get(card);
      if (bit === undefined) return null;
      mask |= 1 << bit;
    }
    return { kind, cards, mask, points: cards.reduce((sum, card) => sum + pipValue(card), 0) };
  };

  const candidates: Candidate[] = [];

  // sets — every 3-combination of each rank group plus the full quad
  const byRank = new Map<number, CardId[]>();
  for (const card of hand) {
    const rank = rankOf(card);
    byRank.set(rank, [...(byRank.get(rank) ?? []), card]);
  }
  for (const group of sortedGroups(byRank)) {
    if (group.length === 3) {
      push(candidates, build('set', [...group]));
    } else if (group.length === 4) {
      for (let skip = 0; skip < 4; skip++) {
        push(
          candidates,
          build(
            'set',
            group.filter((_, at) => at !== skip),
          ),
        );
      }
      push(candidates, build('set', [...group]));
    }
  }

  // runs — every contiguous stretch of length ≥ 3 per suit, all sub-spans
  const bySuit = new Map<string, CardId[]>();
  for (const card of hand) {
    const suit = suitOf(card);
    bySuit.set(suit, [...(bySuit.get(suit) ?? []), card]);
  }
  for (const cards of sortedGroups(bySuit)) {
    const ordered = [...cards].sort((a, b) => rankOf(a) - rankOf(b));
    for (let start = 0; start < ordered.length; start++) {
      for (let end = start + 2; end < ordered.length; end++) {
        let contiguous = true;
        for (let at = start + 1; at <= end; at++) {
          if (rankOf(ordered[at]!) !== rankOf(ordered[at - 1]!) + 1) {
            contiguous = false;
            break;
          }
        }
        if (!contiguous) break;
        push(candidates, build('run', ordered.slice(start, end + 1)));
      }
    }
  }

  return candidates;
}

function sortedGroups<K>(groups: Map<K, CardId[]>): CardId[][] {
  return [...groups.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([, cards]) => [...cards].sort());
}

function push(candidates: Candidate[], meld: Candidate | null): void {
  if (meld) candidates.push(meld);
}

/**
 * Best partition of the hand into disjoint melds. Ties break deterministically:
 * more melds first, then the lexicographically smallest serialized meld list,
 * so replays, UI highlights and bot decisions never wobble.
 */
export function bestPartition(hand: readonly CardId[]): GinPartition {
  const candidates = candidateMelds(hand);

  // memo[usedMask] → best (score, meldCount, chosenIndices suffix) from `at`
  const memo = new Map<number, Selection>();
  const search = (at: number, used: number): Selection => {
    if (at === candidates.length) return { score: 0, count: 0, picks: [] };
    const key = (used << 7) | at;
    const cached = memo.get(key);
    if (cached) return cached;

    const skip = search(at + 1, used);
    const meld = candidates[at]!;
    let best = skip;
    if ((used & meld.mask) === 0) {
      const taken = search(at + 1, used | meld.mask);
      const option: Selection = {
        score: meld.points + taken.score,
        count: 1 + taken.count,
        picks: [at, ...taken.picks],
      };
      best = better(option, skip) ? option : skip;
    }
    memo.set(key, best);
    return best;
  };

  const winner = search(0, 0);
  const melds = winner.picks.map((at) => candidateToMeld(candidates[at]!));
  const melded = new Set(melds.flatMap((meld) => meld.cards));
  const deadwoodCards = [...hand].filter((card) => !melded.has(card)).sort();
  return {
    melds,
    deadwoodCards,
    deadwood: deadwoodCards.reduce((sum, card) => sum + pipValue(card), 0),
  };
}

interface Selection {
  score: number;
  count: number;
  picks: number[];
}

function better(a: Selection, b: Selection): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.count !== b.count) return a.count > b.count;
  return serialize(a.picks) < serialize(b.picks);
}

function serialize(picks: readonly number[]): string {
  return picks.join(',');
}

function candidateToMeld(candidate: Candidate): GinMeld {
  return { kind: candidate.kind, cards: [...candidate.cards] };
}

export function deadwoodOf(hand: readonly CardId[]): number {
  return bestPartition(hand).deadwood;
}

const GIN_CARD = /^[SHDC]([1-9]|1[0-3])$/;
const GIN_SUIT_ORDER: Readonly<Record<string, number>> = { C: 0, D: 1, H: 2, S: 3 };

function ginSuitPosition(card: CardId): number {
  return GIN_SUIT_ORDER[card[0] ?? ''] ?? 99;
}

function orderGinCards(cards: readonly CardId[], primary: 'rank' | 'suit'): CardId[] {
  return stableCardOrder(cards, (left, right) => {
    const rankDiff = rankOf(left) - rankOf(right);
    const suitDiff = ginSuitPosition(left) - ginSuitPosition(right);
    return (
      (primary === 'rank' ? rankDiff || suitDiff : suitDiff || rankDiff) ||
      left.localeCompare(right)
    );
  });
}

/** Best completed melds first; remaining deadwood is rank-grouped for sets and runs. */
export const orderGinHand: HandOrder = (cards) => {
  if (cards.some((card) => !GIN_CARD.test(card))) return [...cards];
  const partition = bestPartition(cards);
  const melds = [...partition.melds].sort((left, right) => {
    const kindDiff = Number(left.kind === 'set') - Number(right.kind === 'set');
    if (kindDiff !== 0) return kindDiff;
    const a = left.cards[0]!;
    const b = right.cards[0]!;
    return left.kind === 'run'
      ? ginSuitPosition(a) - ginSuitPosition(b) || rankOf(a) - rankOf(b)
      : rankOf(a) - rankOf(b);
  });
  return [
    ...melds.flatMap((meld) => orderGinCards(meld.cards, meld.kind === 'run' ? 'suit' : 'rank')),
    ...orderGinCards(partition.deadwoodCards, 'rank'),
  ];
};

// ---------------------------------------------------------------------------
// Layoffs — defender deadwood added onto the knocker's melds after a knock.
// Runs extend at either end within A(low)…K(high); a 3-card set takes its
// fourth. Applied to a fixpoint in canonical order so results never depend on
// iteration luck.
// ---------------------------------------------------------------------------

export interface Layoff {
  card: CardId;
  /** index into the knocker's meld list the card was added to */
  meldIndex: number;
}

export function findLayoffs(
  knockerMelds: readonly GinMeld[],
  defenderDeadwood: readonly CardId[],
): { melds: GinMeld[]; layoffs: Layoff[] } {
  const melds: GinMeld[] = knockerMelds.map((meld) => ({ ...meld, cards: [...meld.cards] }));
  const layoffs: Layoff[] = [];
  const remaining = [...defenderDeadwood].sort();

  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const target = layoffTarget(melds, remaining[i]!);
      if (target === null) continue;
      const card = remaining.splice(i, 1)[0]!;
      melds[target.meldIndex]!.cards.push(card);
      if (melds[target.meldIndex]!.kind === 'run') {
        melds[target.meldIndex]!.cards.sort((a, b) => rankOf(a) - rankOf(b));
      }
      layoffs.push({ card, meldIndex: target.meldIndex });
      progress = true;
      break;
    }
  }

  return { melds, layoffs };
}

function layoffTarget(melds: readonly GinMeld[], card: CardId): { meldIndex: number } | null {
  for (let meldIndex = 0; meldIndex < melds.length; meldIndex++) {
    const meld = melds[meldIndex]!;
    if (meld.kind === 'set') {
      if (meld.cards.length >= 4) continue;
      if (meld.cards.every((held) => rankOf(held) === rankOf(card))) return { meldIndex };
    } else {
      if (!meld.cards.every((held) => suitOf(held) === suitOf(card))) continue;
      const ranks = meld.cards.map(rankOf);
      const low = Math.min(...ranks);
      const high = Math.max(...ranks);
      if (low > 1 && rankOf(card) === low - 1) return { meldIndex };
      if (high < 13 && rankOf(card) === high + 1) return { meldIndex };
    }
  }
  return null;
}
