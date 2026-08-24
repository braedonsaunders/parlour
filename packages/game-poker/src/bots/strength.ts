import type { CardId, Rng, SeatId } from '@parlour/engine';
import { BOARD_CARDS, HOLE_CARDS, fullDeck, rankOf, suitOf } from '../cards';
import { compareHands, rankHand } from '../evaluate';
import { contestingSeats, type PokerState } from '../state';

/**
 * The Chen formula — the standard back-of-a-napkin score for two hole cards.
 *
 * It exists here because before the flop a Monte Carlo run is mostly measuring
 * the same thing at more expense, and because a bot that misreads a hand the
 * way a person does is better company than one that misreads it randomly.
 * Returns roughly −1 (72 offsuit) to 20 (a pair of aces).
 */
export function chenScore(hole: readonly CardId[]): number {
  const [first, second] = hole;
  if (!first || !second) return 0;

  const high = Math.max(rankOf(first), rankOf(second));
  const low = Math.min(rankOf(first), rankOf(second));

  const base = high === 14 ? 10 : high === 13 ? 8 : high === 12 ? 7 : high === 11 ? 6 : high / 2;

  let score = base;
  if (high === low) score = Math.max(base * 2, 5);
  if (suitOf(first) === suitOf(second)) score += 2;

  const gap = high - low - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;

  // Two connected low cards can still make a straight; the formula pays a
  // point for it, and only below a queen.
  if (gap <= 1 && high < 12 && high !== low) score += 1;

  return Math.round(score);
}

/** Chen mapped onto the 0..1 scale the decision code works in. */
export function preflopStrength(hole: readonly CardId[]): number {
  return Math.max(0, Math.min(1, (chenScore(hole) + 1) / 21));
}

/** Every card the seat cannot be dealt: its own, the board, and anything shown. */
function unseenCards(state: PokerState, seat: SeatId): CardId[] {
  const known = new Set<CardId>([...state.board]);
  for (const card of state.hole[seat] ?? []) known.add(card);
  state.hole.forEach((cards, index) => {
    if (state.shown[index]) for (const card of cards) known.add(card);
  });
  return fullDeck().filter((card) => !known.has(card) && !card.startsWith('?'));
}

/**
 * The share of the pot this hand expects to win, by dealing the rest out.
 *
 * `samples` is the whole difficulty dial. Forty runs is a genuinely noisy read
 * that will talk itself into bad calls; three hundred is close enough to the
 * true number that the bot is mostly making the right one. Both are the same
 * code being more or less careful, which is a more honest kind of easy
 * opponent than one told to blunder on a timer.
 */
export function equity(state: PokerState, seat: SeatId, rng: Rng, samples: number): number {
  const hole = (state.hole[seat] ?? []).filter((card) => !card.startsWith('?'));
  if (hole.length < HOLE_CARDS) return 0;

  const opponents = contestingSeats(state).filter((other) => other !== seat).length;
  if (opponents === 0) return 1;

  const deck = unseenCards(state, seat);
  const boardNeeded = BOARD_CARDS - state.board.length;
  const needed = boardNeeded + opponents * HOLE_CARDS;
  if (deck.length < needed) return 0;

  let share = 0;

  for (let trial = 0; trial < samples; trial++) {
    // Partial Fisher-Yates: only the cards this trial actually uses get moved.
    const pool = [...deck];
    for (let index = 0; index < needed; index++) {
      const swap = index + rng.int(pool.length - index);
      [pool[index], pool[swap]] = [pool[swap] as CardId, pool[index] as CardId];
    }

    const board = [...state.board, ...pool.slice(0, boardNeeded)];
    const mine = rankHand([...hole, ...board]);

    let better = 0;
    let tied = 0;
    for (let other = 0; other < opponents; other++) {
      const at = boardNeeded + other * HOLE_CARDS;
      const theirs = rankHand([pool[at] as CardId, pool[at + 1] as CardId, ...board]);
      const verdict = compareHands(theirs, mine);
      if (verdict > 0) {
        better += 1;
        break;
      }
      if (verdict === 0) tied += 1;
    }

    if (better === 0) share += 1 / (tied + 1);
  }

  return share / samples;
}

/**
 * How strong the hand is right now, on the 0..1 scale, without dealing anything
 * out. Cheap, and the only read available before there is a board to run.
 */
export function strengthNow(state: PokerState, seat: SeatId, rng: Rng, samples: number): number {
  if (state.street === 'preflop') return preflopStrength(state.hole[seat] ?? []);
  return equity(state, seat, rng, samples);
}
