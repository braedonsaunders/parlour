import type { CardId, SeatId } from '@parlour/engine';
import { QUEEN_SPADES, isHeart, suitOfCard } from '../cards';
import type { HeartsRules } from '../config';
import type { HeartsState } from '../state';

/** Shared card-risk arithmetic for all three bot tiers. Pure over the view. */

export function cardsSeen(state: HeartsState): Set<CardId> {
  const seen = new Set<CardId>();
  for (const pile of state.taken) for (const card of pile) seen.add(card);
  for (const play of state.plays) seen.add(play.card);
  return seen;
}

export function queenStillOut(state: HeartsState): boolean {
  return !cardsSeen(state).has(QUEEN_SPADES);
}

export function spadesSeen(state: HeartsState): number {
  let count = 0;
  for (const card of cardsSeen(state)) if (suitOfCard(card) === 'spades') count += 1;
  return count;
}

export interface TrickRead {
  ledSuit: string | null;
  winningSeat: SeatId | null;
  winningRank: number;
  pointsOnTable: number;
  heartsOnTable: number;
}

export function readTrick(
  plays: readonly { seat: SeatId; card: CardId }[],
  rankOf: (card: CardId) => number,
  jackDiamonds: boolean,
): TrickRead {
  if (plays.length === 0) {
    return { ledSuit: null, winningSeat: null, winningRank: -1, pointsOnTable: 0, heartsOnTable: 0 };
  }
  const ledSuit = suitOfCard(plays[0]!.card);
  let winningSeat = plays[0]!.seat;
  let winningRank = rankOf(plays[0]!.card);
  let points = 0;
  let hearts = 0;
  for (const play of plays) {
    if (isHeart(play.card)) hearts += 1;
    if (suitOfCard(play.card) !== ledSuit) continue;
    if (rankOf(play.card) > winningRank) {
      winningRank = rankOf(play.card);
      winningSeat = play.seat;
    }
  }
  void jackDiamonds;
  return { ledSuit, winningSeat, winningRank, pointsOnTable: points, heartsOnTable: hearts };
}

/**
 * Danger of holding a card at pass time — higher goes. High spades are toxic
 * while the queen is out; high hearts feed whoever wins the trick they land in.
 */
export function passDanger(card: CardId, rules: Pick<HeartsRules, 'jackDiamonds'>): number {
  const rank = Number.parseInt(card.slice(1), 10) || 0;
  const suit = suitOfCard(card);
  let danger = rank;
  if (card === QUEEN_SPADES) danger += 20;
  else if (suit === 'spades' && rank >= 13) danger += 12;
  if (suit === 'hearts') danger += Math.max(0, rank - 6);
  void rules.jackDiamonds;
  return danger;
}

/**
 * Void-creation bonus during the pass: a suit with one or two low cards is
 * worth emptying so later discards go free.
 */
export function voidBonus(hand: readonly CardId[], card: CardId): number {
  const suit = suitOfCard(card);
  if (!suit || suit === 'spades') return 0;
  const inSuit = hand.filter((other) => suitOfCard(other) === suit);
  if (inSuit.length <= 2 && inSuit.every((other) => (Number.parseInt(other.slice(1), 10) || 0) <= 6)) {
    return 4 - inSuit.length;
  }
  return 0;
}

/** Suits a seat has proven void in by failing to follow lead. */
export function knownVoids(
  plays: readonly { seat: SeatId; card: CardId }[],
  seats: number,
): Set<string> {
  const voids = new Set<string>();
  for (let index = 0; index < plays.length; index++) {
    const trickStart = index - (index % seats);
    const led = suitOfCard(plays[trickStart]!.card);
    if (!led || index === trickStart) continue;
    const play = plays[index]!;
    if (suitOfCard(play.card) !== led) voids.add(`${play.seat}:${led}`);
  }
  return voids;
}
