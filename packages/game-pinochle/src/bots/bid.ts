import type { Rng, SeatId } from '@parlour/engine';
import { MAX_BID } from '../config';
import type { PinochleState } from '../state';
import { handStrength, jitter } from './evaluate';

export interface BidParams {
  /** fraction of the estimated hand strength a seat is willing to bid up to */
  bidCeilingFactor: number;
  jitterAmount: number;
}

export interface BidDecision {
  move: 'bid' | 'pass';
  payload?: { bid: number };
}

export function decideBid(
  state: PinochleState,
  seat: SeatId,
  params: BidParams,
  rng: Rng,
): BidDecision {
  const { estimate } = handStrength(state.hands[seat] ?? []);
  const ceiling = Math.round(jitter(estimate * params.bidCeilingFactor, params.jitterAmount, rng));
  const floor = state.highBid === null ? state.rules.minBid : state.highBid + 1;
  if (floor > ceiling || floor > MAX_BID) return { move: 'pass' };
  return { move: 'bid', payload: { bid: Math.min(floor, MAX_BID) } };
}
