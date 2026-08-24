import type { Rng } from '@parlour/engine';
import { EUCHRE_SUITS, suitLetterOf, type EuchreSuit } from '../deck';
import type { EuchreState } from '../state';
import { bestCallCandidate, handStrength, jitter, trumpCount } from './evaluate';

/** Tunable bidding behaviour — tiers and personas skew these numbers. */
export interface BidParams {
  /** hand strength (incl. the upcard for the dealer) needed to order up */
  orderUpMin: number;
  /** strength needed to name a suit in round two */
  callMin: number;
  /** strength needed to go alone; Infinity never goes alone */
  aloneMin: number;
  /** bonus when ordering up your partner's deal, feeding their hand */
  partnerDealerBonus: number;
  /** threshold jitter magnitude for personality */
  jitter: number;
  /** naive raw-count floor for easy bots; null switches to strength valuation */
  naiveTrumpFloor: number | null;
}

export interface BidDecision {
  move: 'orderUp' | 'callTrump' | 'bidPass';
  payload?: { suit?: EuchreSuit; alone?: boolean };
}

export function decideBid(
  state: EuchreState,
  seat: number,
  params: BidParams,
  rng: Rng,
): BidDecision {
  const hand = state.hands[seat] ?? [];
  if (state.biddingRound === 1) return decideRoundOne(state, seat, hand, params, rng);
  return decideRoundTwo(state, seat, hand, params, rng);
}

function decideRoundOne(
  state: EuchreState,
  seat: number,
  hand: readonly string[],
  params: BidParams,
  rng: Rng,
): BidDecision {
  const upcard = state.upcard;
  const suit = upcard ? suitLetterOf(upcard) : null;
  if (!upcard || !suit) return { move: 'bidPass' };

  const isDealer = seat === state.dealer;

  if (params.naiveTrumpFloor !== null) {
    const count = hand.filter((card) => suitLetterOf(card) === suit).length;
    if ((isDealer ? count + 1 : count) >= params.naiveTrumpFloor) {
      return { move: 'orderUp', payload: { alone: false } };
    }
    return { move: 'bidPass' };
  }

  const effective = isDealer ? [...hand, upcard] : hand;
  let strength = handStrength(effective, suit);
  if (state.dealer === (seat + 2) % 4 && !isDealer) strength += params.partnerDealerBonus;
  const threshold = jitter(params.orderUpMin, params.jitter, rng);

  if (strength >= threshold) {
    const alone =
      state.rules.goingAlone &&
      strength >= params.aloneMin &&
      trumpCount(effective, suit) >= 4;
    return { move: 'orderUp', payload: { alone } };
  }
  return { move: 'bidPass' };
}

function decideRoundTwo(
  state: EuchreState,
  seat: number,
  hand: readonly string[],
  params: BidParams,
  rng: Rng,
): BidDecision {
  const allowed = EUCHRE_SUITS.filter(
    (suit) => state.turnedDown === null || suitLetterOf(state.turnedDown) !== suit,
  );
  const candidate = bestCallCandidate(hand, allowed);
  if (!candidate) return { move: 'bidPass' };

  const forced =
    state.rules.stickDealer && state.passesThisRound === 3 && seat === state.dealer;
  if (forced) {
    return { move: 'callTrump', payload: { suit: candidate.suit, alone: false } };
  }

  const threshold = jitter(params.callMin, params.jitter, rng);
  if (candidate.strength >= threshold && candidate.count >= 3) {
    const alone =
      state.rules.goingAlone &&
      candidate.strength >= params.aloneMin &&
      candidate.count >= 4;
    return { move: 'callTrump', payload: { suit: candidate.suit, alone } };
  }
  return { move: 'bidPass' };
}
