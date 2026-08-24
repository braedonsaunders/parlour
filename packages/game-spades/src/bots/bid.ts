import type { Rng } from '@parlour/engine';
import { expectedTricks, highCardPoints, ownHand, spadeCount } from './evaluate';
import type { SpadesState } from '../state';

export interface BidParams {
  /** add this to expected books before rounding */
  aggression: number;
  /** bid nil when expected books sit at or below this (and nil is on) */
  nilMax: number;
  /** never nil if holding this many spades or more */
  nilSpadeCap: number;
  /** shy away from bags when already this close to a 10-bag cycle */
  bagFear: number;
  jitter: number;
}

export function decideBid(state: SpadesState, seat: number, params: BidParams, rng: Rng): number {
  const hand = ownHand(state, seat);
  const expected = expectedTricks(hand);
  const spades = spadeCount(hand);
  const points = highCardPoints(hand);
  const min = state.rules.nil ? 0 : 1;

  if (state.rules.nil && expected <= params.nilMax && spades <= params.nilSpadeCap && points <= 6) {
    return 0;
  }

  let bid = expected + params.aggression + (params.jitter === 0 ? 0 : (rng.float() - 0.5) * params.jitter);
  if (state.rules.bags) {
    const team = seat % 2;
    const bags = state.bags[team] ?? 0;
    if (bags >= params.bagFear && bid > expected) bid = expected;
  }

  const rounded = Math.round(bid);
  return Math.min(13, Math.max(min, rounded === 0 && !state.rules.nil ? 1 : rounded));
}
