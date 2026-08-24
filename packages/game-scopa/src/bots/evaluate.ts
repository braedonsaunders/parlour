import type { CardId, LegalMove, Rng } from '@parlour/engine';
import { sumValues, takeableValues } from '../capture';
import { captureValue, isDenari, isSettebello } from '../cards';
import type { ScopaState } from '../state';

/**
 * Shared play heuristics. Bots see the same masked view humans do — other
 * hands and the stock are `??` — so "counting what is left" means reasoning
 * over the publicly visible captures, table and own hand only.
 */
export interface PlayParams {
  /** appetite for denari, on top of their capture count */
  coin: number;
  /** extra weight for the settebello */
  settebello: number;
  /** weight per 6 or 7 captured — primiera building blocks */
  prime: number;
  /** reward for a take that clears the table (a scopa) */
  scopa: number;
  /** penalty for leaving takeable values lying around after a pose */
  risk: number;
  /** reluctance to pose prize cards (coins, sevens, sixes) */
  hold: number;
  /** model the hidden distribution instead of assuming every value is out there */
  countUnseen: boolean;
  /** random noise added to scores before picking */
  jitter: number;
}

export const MEDIUM_PARAMS: PlayParams = {
  coin: 1.2,
  settebello: 2,
  prime: 0.5,
  scopa: 1.4,
  risk: 0.9,
  hold: 0.6,
  countUnseen: false,
  jitter: 0.25,
};

export const HARD_PARAMS: PlayParams = {
  // carte is the most reliable punto, coins the second — weight accordingly
  coin: 1.4,
  settebello: 3,
  prime: 0.9,
  scopa: 1.6,
  risk: 1.5,
  hold: 1.1,
  countUnseen: true,
  jitter: 0.08,
};

/** How many cards of each value 1..10 are genuinely unaccounted for. */
export function unseenValueCounts(view: ScopaState): number[] {
  const counts = new Array<number>(11).fill(4);
  const burn = (card: CardId | undefined | null): void => {
    if (!card) return;
    const value = captureValue(card);
    if (value >= 1 && value <= 10) counts[value]! -= 1;
  };
  view.hands.forEach((hand) => hand.forEach(burn));
  view.table.forEach(burn);
  view.captures.forEach((pile) => pile.forEach(burn));
  return counts;
}

function prizeWeight(card: CardId, params: PlayParams): number {
  let weight = 0;
  if (isDenari(card)) weight += params.coin;
  if (isSettebello(card)) weight += params.settebello;
  const value = captureValue(card);
  if (value === 6 || value === 7) weight += params.prime;
  return weight;
}

function poseScore(
  card: CardId,
  view: ScopaState,
  params: PlayParams,
  unseen: readonly number[],
): number {
  // giving up a prize card hurts; low pips hurt less than high ones
  const score = -params.hold * prizeWeight(card, params) - captureValue(card) * 0.04;

  const nextTable = [...view.table, card];
  const takable = takeableValues(nextTable);
  const fullSum = sumValues(nextTable);
  let threat = 0;
  let scopaBait = false;
  for (let value = 1; value <= 10; value++) {
    if (!takable.has(value)) continue;
    // low values are likelier to sit in an opponent hand; faces matter less
    const likelihood = value <= 7 ? 1 : 0.35;
    threat += likelihood * (params.countUnseen ? (unseen[value] ?? 0) / 4 : 1);
    if (params.countUnseen && (unseen[value] ?? 0) > 0) scopaBait ||= value === fullSum;
  }
  if (!params.countUnseen && fullSum >= 1 && fullSum <= 10) scopaBait = takable.has(fullSum);
  return score - params.risk * (threat * 0.25 + (scopaBait ? 2 : 0));
}

function takeScore(
  take: readonly CardId[],
  played: CardId,
  view: ScopaState,
  params: PlayParams,
): number {
  let score = take.length + prizeWeight(played, params) * 0.5;
  for (const card of [...take, played]) score += prizeWeight(card, params);
  // clearing the table mid-round IS the scopa; on the final play it is free
  if (view.table.length - take.length === 0) score += params.scopa;
  // a capture that leaves prizes sitting out invites the opponent to take them
  const remaining = view.table.filter((card) => !take.includes(card));
  for (const card of remaining) {
    if (isSettebello(card)) score -= params.settebello * 0.6;
    else if (isDenari(card)) score -= params.coin * 0.35;
    else {
      const value = captureValue(card);
      if (value === 6 || value === 7) score -= params.prime * 0.3;
    }
  }
  return score;
}

export interface ScoredOption {
  move: LegalMove;
  score: number;
}

interface ParsedMove {
  move: LegalMove;
  card: CardId;
  take: CardId[];
}

function parsePlayMoves(legal: readonly LegalMove[]): ParsedMove[] {
  const parsed: ParsedMove[] = [];
  for (const move of legal) {
    if (move.id !== 'playCard') continue;
    const payload = move.payload as { card?: unknown; take?: unknown } | undefined;
    if (typeof payload?.card !== 'string') continue;
    const take = Array.isArray(payload.take)
      ? payload.take.filter((id): id is CardId => typeof id === 'string')
      : [];
    parsed.push({ move, card: payload.card, take });
  }
  return parsed;
}

/** Scores every legal play; used by medium/hard and by persona skews. */
export function rankPlays(
  view: ScopaState,
  legal: readonly LegalMove[],
  params: PlayParams,
): ScoredOption[] {
  const moves = parsePlayMoves(legal);
  if (moves.length === 0) return [];
  const unseen = unseenValueCounts(view);
  return moves.map(({ move, card, take }) => ({
    move,
    score:
      take.length > 0 ? takeScore(take, card, view, params) : poseScore(card, view, params, unseen),
  }));
}

/** Picks the top-scored play with jittered tie-breaking. */
export function decidePlay(
  view: ScopaState,
  legal: readonly LegalMove[],
  rng: Rng,
  params: PlayParams,
): LegalMove | null {
  const scored = rankPlays(view, legal, params);
  if (scored.length === 0) return null;
  const noisy = scored.map((option) => ({
    ...option,
    score: option.score + rng.float() * params.jitter,
  }));
  let best = noisy[0]!;
  for (const option of noisy) {
    if (option.score > best.score || (option.score === best.score && rng.float() < 0.5)) {
      best = option;
    }
  }
  return best.move;
}
