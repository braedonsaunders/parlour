import type { EuchreSuit } from '../deck';
import { effectiveSuit, isLeftBower, isRightBower, rankOf, suitLetterOf } from '../deck';
import type { EuchreState } from '../state';
import {
  cheapestWinner,
  currentTrickWinner,
  singletonAceLead,
  weakestCard,
} from './evaluate';

/** Tunable trick-play behaviour — tiers and personas skew these weights. */
export interface PlayParams {
  /** weight for drawing trump when your side called and holds a stack */
  leadTrumpAggression: number;
  /** true: keep bowers sheathed until they must win or are safe to cash */
  protectBossCards: boolean;
  /** ruff whenever an opponent leads and trump can take the trick */
  eagerRuff: boolean;
}

export interface PlayDecision {
  card: string;
}

/**
 * Chooses a card from `legal` (already filtered for follow-suit where
 * enforceable). Only public facts and the mover's own cards are read.
 */
export function decidePlay(
  state: EuchreState,
  seat: number,
  legal: readonly string[],
  params: PlayParams,
): PlayDecision {
  const trump = state.trump;
  if (!trump || legal.length === 0) return { card: legal[0] ?? '' };

  if (state.trick.length === 0) return { card: chooseLead(state, seat, legal, trump, params) };

  const led = effectiveSuit(state.trick[0]!.card, trump);
  if (!led) return { card: legal[0] as string };

  const winner = currentTrickWinner(state.trick, trump);
  const partnerWinning = winner !== null && winner % 2 === seat % 2;
  const lastToPlay = state.trick.length === (state.sittingOut === null ? 4 : 3) - 1;

  const followers = legal.filter((card) => effectiveSuit(card, trump) === led);
  if (followers.length > 0) {
    if (partnerWinning) return { card: pickLowest(followers, trump, led, params.protectBossCards) };
    const beatenBy = bestStrengthSoFar(state.trick, trump, led);
    const winCard = cheapestWinner(legal, trump, led, beatenBy);
    if (winCard && (lastToPlay || !params.protectBossCards || !isBossCard(winCard, trump))) {
      return { card: winCard };
    }
    return { card: pickLowest(followers, trump, led, params.protectBossCards) };
  }

  // void in the led suit
  const trumps = legal.filter((card) => effectiveSuit(card, trump) === trump);
  if (trumps.length > 0 && !partnerWinning && (params.eagerRuff || lastToPlay)) {
    const beatenBy = bestStrengthSoFar(state.trick, trump, led);
    const ruff = cheapestWinner(trumps, trump, led, beatenBy);
    if (ruff) return { card: ruff };
  }
  return { card: weakestCard(legal, trump) };
}

function bestStrengthSoFar(
  trick: readonly { seat: number; card: string }[],
  trump: EuchreSuit,
  led: EuchreSuit,
): number {
  let best = -1;
  for (const play of trick) {
    const strength = strengthOf(play.card, trump, led);
    if (strength !== null && strength > best) best = strength;
  }
  return best;
}

function strengthOf(card: string, trump: EuchreSuit, led: EuchreSuit): number | null {
  if (isRightBower(card, trump)) return 13;
  if (isLeftBower(card, trump)) return 12;
  const suit = suitLetterOf(card);
  const rank = rankOf(card);
  if (!suit || rank === null) return null;
  if (suit === trump) return 6 + (rank === 1 ? 5 : rank - 9);
  return suit === led ? (rank === 1 ? 5 : rank >= 9 ? rank - 9 : -1) : null;
}

function isBossCard(card: string, trump: EuchreSuit): boolean {
  return isRightBower(card, trump) || isLeftBower(card, trump);
}

function pickLowest(
  cards: readonly string[],
  trump: EuchreSuit,
  led: EuchreSuit,
  protectBoss: boolean,
): string {
  const pool =
    protectBoss && cards.length > 1 ? cards.filter((card) => !isBossCard(card, trump)) : cards;
  const candidates = pool.length > 0 ? pool : cards;
  let best = candidates[0] as string;
  let bestStrength = Number.POSITIVE_INFINITY;
  for (const card of candidates) {
    const strength = strengthOf(card, trump, led) ?? Number.POSITIVE_INFINITY;
    if (strength < bestStrength) {
      best = card;
      bestStrength = strength;
    }
  }
  return best;
}

function chooseLead(
  state: EuchreState,
  _seat: number,
  legal: readonly string[],
  trump: EuchreSuit,
  params: PlayParams,
): string {
  const myTeamCalled = state.caller !== null && state.caller % 2 === _seat % 2;
  const trumps = legal.filter((card) => effectiveSuit(card, trump) === trump);

  if (myTeamCalled && trumps.length > 0 && params.leadTrumpAggression > 0) {
    const stack = trumps.length >= 3 || params.leadTrumpAggression > 1;
    if (stack) {
      // draw out the opposition's trump while we hold power
      const boss = trumps.find((card) => isRightBower(card, trump));
      return boss ?? highest(trumps, trump);
    }
  }

  const ace = params.leadTrumpAggression > 0 ? singletonAceLead(legal, trump) : null;
  if (ace) return ace;

  const nonTrump = legal.filter((card) => effectiveSuit(card, trump) !== trump);
  const pool = nonTrump.length > 0 ? nonTrump : legal;
  return [...pool].sort((a, b) => leadDesire(a, trump) - leadDesire(b, trump))[pool.length - 1]!;
}

function highest(cards: readonly string[], trump: EuchreSuit): string {
  return cards.reduce((best, card) =>
    strengthOf(card, trump, trump)! > strengthOf(best, trump, trump)! ? card : best,
  );
}

function leadDesire(card: string, trump: EuchreSuit): number {
  const rank = rankOf(card);
  let desire = rank === null ? 0 : rank === 1 ? 50 : rank >= 9 ? rank * 2 : 4;
  if (isRightBower(card, trump)) desire += 40;
  if (isLeftBower(card, trump)) desire -= 10;
  return desire;
}
