import type { CardId, MatchResultRank, SeatId } from '@parlour/engine';
import {
  captureValue,
  isDenari,
  isReDenari,
  isSettebello,
  ownerCount,
  ownerOf as seatOwnerOf,
  seatsOfOwner,
  SUITS,
  type SuitName,
} from './cards';
import type { ScopaRules } from './config';
import type { Award, AwardKind } from './state';

/**
 * Primiera value of a pip rank. The canonical table — 7→21, 6→18, A→16,
 * 5→15, 4→14, 3→13, 2→12, faces (8/9/10)→10 — is the single most misquoted
 * thing in Scopa implementations; keep it verbatim.
 */
const PRIMIERA_TABLE: Readonly<Record<number, number>> = {
  1: 16,
  2: 12,
  3: 13,
  4: 14,
  5: 15,
  6: 18,
  7: 21,
  8: 10,
  9: 10,
  10: 10,
};

export function primieraValue(rank: number): number {
  return PRIMIERA_TABLE[rank] ?? 0;
}

/**
 * Sum of each suit's best card. A player void in ANY suit cannot win
 * primiera — represented here as null rather than a low number so callers
 * cannot accidentally rank a void hand against real totals.
 */
export function primieraTotal(cards: readonly CardId[]): number | null {
  const best = new Map<SuitName, number>();
  for (const card of cards) {
    const value = primieraValue(captureValue(card));
    best.set(suitOf(card), Math.max(best.get(suitOf(card)) ?? -1, value));
  }
  let total = 0;
  for (const suit of SUITS) {
    const value = best.get(suit);
    if (value === undefined) return null;
    total += value;
  }
  return total;
}

function suitOf(card: CardId): SuitName {
  const key = card.charAt(0);
  return key === 'C' ? 'coppe' : key === 'S' ? 'spade' : key === 'B' ? 'bastoni' : 'denari';
}

export interface RoundScoreInput {
  seats: number;
  /** captured pile per seat — pooled into teams at partnership sizes */
  capturesBySeat: readonly CardId[][];
  scopeBySeat: readonly number[];
  rules: Pick<ScopaRules, 'napola' | 'reDenari'>;
}

export interface OwnerRoundScore {
  owner: number;
  cards: number;
  denari: number;
  settebello: boolean;
  primiera: number | null;
  napolaRun: number;
  reDenari: boolean;
  scope: number;
}

export interface RoundScore {
  owners: OwnerRoundScore[];
  awards: readonly Award[];
  /** points per score-owner, aligned with the owners array */
  deltas: number[];
}

/** Ace-2-3 of coins plus every coin card continuing the run from 3. */
export function napolaRun(coins: readonly CardId[]): number {
  const held = new Set(coins.map(captureValue));
  if (!held.has(1) || !held.has(2) || !held.has(3)) return 0;
  let run = 3;
  while (held.has(run + 1)) run += 1;
  return run;
}

/** The single strict maximum of a metric, or null on any tie/absence. */
function uniqueTop(entries: readonly { owner: number; value: number }[]): number | null {
  if (entries.length === 0) return null;
  const top = Math.max(...entries.map((entry) => entry.value));
  if (top <= 0) return null;
  const leaders = entries.filter((entry) => entry.value === top);
  return leaders.length === 1 ? leaders[0]!.owner : null;
}

/**
 * Scores one completed round. Capture piles are pooled per score-owner first:
 * at four and six seats the points belong to the team, including primiera,
 * where partners' cards combine for each suit's best.
 *
 * Carte and denari go to the outright leader only ("most" — the 21+/6+ major-
 * ity of the two-hander); any tie scores nobody. Settebello is always exactly
 * 1 point to its capturer.
 */
export function scoreRound(input: RoundScoreInput): RoundScore {
  const { seats } = input;
  const pooled: CardId[][] = Array.from({ length: ownerCount(seats) }, () => []);
  input.capturesBySeat.forEach((pile, seat) => {
    pooled[seatOwnerOf(seat, seats)]!.push(...pile);
  });

  const scopeByOwner = new Array<number>(ownerCount(seats)).fill(0);
  input.scopeBySeat.forEach((count, seat) => {
    scopeByOwner[seatOwnerOf(seat, seats)]! += count;
  });

  const owners: OwnerRoundScore[] = pooled.map((cards, owner) => ({
    owner,
    cards: cards.length,
    denari: cards.filter(isDenari).length,
    settebello: cards.some(isSettebello),
    primiera: primieraTotal(cards),
    napolaRun: input.rules.napola ? napolaRun(cards.filter(isDenari)) : 0,
    reDenari: input.rules.reDenari && cards.some(isReDenari),
    scope: scopeByOwner[owner]!,
  }));

  const awards: Award[] = [];
  const addAward = (kind: AwardKind, owner: number | null, points = 1): void => {
    if (owner === null || points <= 0) return;
    awards.push({ kind, owner, points });
  };

  addAward('carte', uniqueTop(owners.map((o) => ({ owner: o.owner, value: o.cards }))));
  addAward('denari', uniqueTop(owners.map((o) => ({ owner: o.owner, value: o.denari }))));

  const settebelloOwners = owners.filter((o) => o.settebello);
  if (settebelloOwners.length === 1) addAward('settebello', settebelloOwners[0]!.owner);

  // void-in-a-suit hands never enter the primiera comparison
  addAward(
    'primiera',
    uniqueTop(
      owners
        .filter((o) => o.primiera !== null)
        .map((o) => ({ owner: o.owner, value: o.primiera as number })),
    ),
  );

  for (const o of owners) {
    if (o.napolaRun >= 3) addAward('napola', o.owner, o.napolaRun);
    if (o.reDenari) addAward('re-denari', o.owner);
    if (o.scope > 0) addAward('scope', o.owner, o.scope);
  }

  const deltas = new Array<number>(owners.length).fill(0);
  for (const award of awards) deltas[award.owner]! += award.points;

  return { owners, awards, deltas };
}

// ---------------------------------------------------------------------------
// Match line
// ---------------------------------------------------------------------------

/**
 * The match ends when one owner is strictly above the rest at or over target.
 * A tie at the line keeps the match alive: deal another round.
 */
export function matchOver(scores: readonly number[], target: number): { winner: number } | null {
  const top = Math.max(...scores);
  if (top < target) return null;
  const leaders = scores.filter((score) => score === top).length;
  return leaders === 1 ? { winner: scores.indexOf(top) } : null;
}

export interface ScopaMatchResult {
  winner: SeatId;
  rankings: MatchResultRank[];
  reason: string;
}

export function matchResultFor(state: {
  rules: Pick<ScopaRules, 'target'>;
  seats: number;
  scores: readonly number[];
}): ScopaMatchResult | null {
  const over = matchOver(state.scores, state.rules.target);
  if (!over) return null;

  const losingOwners = state.scores
    .map((score, owner) => ({ owner, score }))
    .filter((entry) => entry.owner !== over.winner)
    .sort((a, b) => b.score - a.score || a.owner - b.owner);
  const rankOfOwner = new Map<number, number>();
  for (const entry of losingOwners) {
    rankOfOwner.set(entry.owner, 2 + losingOwners.filter((o) => o.score > entry.score).length);
  }

  const rankings: MatchResultRank[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    const owner = seatOwnerOf(seat, state.seats);
    rankings.push({
      seat,
      rank: owner === over.winner ? 1 : (rankOfOwner.get(owner) ?? 2),
      detail: { owner, score: state.scores[owner] ?? 0 },
    });
  }
  return {
    winner: seatsOfOwner(over.winner, state.seats)[0] ?? over.winner,
    rankings,
    reason: `first to ${state.rules.target}`,
  };
}
