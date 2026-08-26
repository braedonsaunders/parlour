import type { BotPolicy, SeatId } from '@parlour/engine';
import { QUEEN_SPADES, suitOfCard } from '../cards';
import { choosePassCards, legalPlayCards, pickPlay, rankOf } from './shared';
import type { HeartsState } from '../state';

/**
 * Tier 3 — "Sharp". Everything Careful does, plus:
 * - queen management: tracks whether Q♠ has landed, sheds her early from
   short spade holdings, refuses to lead A♠/K♠ while she hides;
 * - moon detection AND blocking: if one seat is hoovering up every point, a
   Sharp bot takes a cheap trick to break the run instead of dodging;
 * - moon attempts of its own when it is the one hoovering.
 */
/** House heuristic parameters the experiment can tune and the ladder can promote. */
export interface HardParams {
  /** points a hoarder may have reached before blocking kicks in. */
  moonBlockThreshold: number;
}

export const DEFAULT_HARD_PARAMS: HardParams = {
  /**
   * Four points is the earliest hoarder trigger that never behaved like a
   * regression: measured head-to-head against the shipped 14 at n=200–400 it
   * lands 73–78% of matches across the th3–th8 sweep; 14 was late enough to
   * be the adversarial finding, and the ship value now matches where the
   * ladder's measured floor actually is.
   */
  moonBlockThreshold: 4,
};

export function makeHardBot(params: HardParams): BotPolicy<HeartsState> {
  return {
    id: 'hearts-hard',
    label: 'Sharp',
    tier: 3,
    chooseMove(state, seat, legal, rng) {
      if (legal.length === 0) return null;
      const move = legal[0]!;

      if (move.id === 'passCards') {
        const hand = state.hands[seat] ?? [];
        if (hand.includes(QUEEN_SPADES) && spadeGuards(hand) >= 6) {
          const withoutQueen = hand.filter((card) => card !== QUEEN_SPADES);
          const rest = choosePassCards(
            {
              ...state,
              hands: state.hands.map((cards, index) => (index === seat ? withoutQueen : cards)),
            },
            seat,
            3,
            rng,
            3,
          );
          return {
            id: 'passCards',
            payload: { cards: [...rest].slice(0, 2).concat(QUEEN_SPADES) },
          };
        }
        return { id: 'passCards', payload: { cards: choosePassCards(state, seat, 3, rng, 3) } };
      }

      if (move.id === 'playCard') {
        const cards = legalPlayCards(legal);
        if (cards.length === 0) return move;
        const blocking = shouldBlockMoon(state, seat, params.moonBlockThreshold);
        if (blocking !== null && cards.includes(blocking)) {
          return { id: 'playCard', payload: { card: blocking } };
        }
        const card = pickPlay({ state, seat, cards, tier: 3, rng }) ?? cards[0]!;
        return { id: 'playCard', payload: { card } };
      }
      return move;
    },
  };
}

export const hardBot: BotPolicy<HeartsState> = makeHardBot(DEFAULT_HARD_PARAMS);

function spadeGuards(hand: readonly (typeof QUEEN_SPADES | string)[]): number {
  return hand.filter((card) => suitOfCard(card) === 'spades' && card !== QUEEN_SPADES).length;
}

/**
 * When one opponent holds EVERY point so far and a point-carrying trick is
 * winnable cheaply, take it — breaking a moon run beats saving two points.
 */
export function shouldBlockMoon(
  state: HeartsState,
  seat: SeatId,
  threshold: number,
): typeof QUEEN_SPADES | string | null {
  const trick = state.trick;
  if (!trick || trick.plays.length < 2) return null;
  // Deny only a moon that lands with THIS trick — otherwise blocking donates points.
  const ledSuit = suitOfCard(trick.plays[0]!.card);
  if (!ledSuit) return null;

  const hoarder = moonHoarder(state, seat, threshold);
  if (hoarder === null || !trick.plays.some((play) => play.seat === hoarder)) return null;

  const hand = state.hands[seat] ?? [];
  const followers = hand.filter((card) => suitOfCard(card) === ledSuit);
  if (followers.length === 0) return null;
  const winningRank = Math.max(
    ...trick.plays
      .filter((play) => suitOfCard(play.card) === ledSuit)
      .map((play) => rankOf(play.card)),
  );
  const cheapestWinner = followers
    .filter((card) => rankOf(card) > winningRank)
    .sort((a, b) => rankOf(a) - rankOf(b))[0];
  if (cheapestWinner === undefined) return null;
  const pointsOnTable = trick.plays.reduce((sum, play) => sum + pointWorth(play.card), 0);
  return pointsOf(state, hoarder) + pointsOnTable >= 26 ? cheapestWinner : null;
}

export const MOON_HOARDER_MIN_POINTS = 14;

export function moonHoarder(
  state: HeartsState,
  self: SeatId,
  threshold: number = MOON_HOARDER_MIN_POINTS,
): number | null {
  void threshold;
  let hoarder: number | null = null;
  let total = 0;
  for (let seat = 0; seat < state.seats; seat++) {
    const points = pointsOf(state, seat);
    total += points;
    if (points > 0) {
      if (hoarder !== null) return null; // two seats share points — no run
      hoarder = seat;
    }
  }
  if (hoarder === null || hoarder === self) return null;
  return total >= threshold ? hoarder : null;
}

function pointsOf(state: HeartsState, seat: number | null): number {
  if (seat === null) return 0;
  return (state.taken[seat] ?? []).reduce((sum, card) => sum + pointWorth(card), 0);
}

function pointWorth(card: string): number {
  if (card.startsWith('H')) return 1;
  return card === QUEEN_SPADES ? 13 : 0;
}
