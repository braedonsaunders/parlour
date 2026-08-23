import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { bestSuit, handValue, suitOf } from '../hand';
import type { BlitzState } from '../state';
import { bestSwap } from './evaluate';
import { chooseNaiveDiscard, isDiscardPhase, turnMoves, type BotParams } from './shared';

/**
 * Tier 1 "Easy" — myopic (spec §9): takes obvious suit matches off the discard
 * pile, knocks at a high fixed threshold, never tracks opponents' pickups.
 */
export function makeEasyBot(params: BotParams, id = 'easy', label = 'Easy'): BotPolicy<BlitzState> {
  return {
    id,
    label,
    tier: 1,
    chooseMove(view: BlitzState, seat: SeatId, legal: readonly LegalMove[], _rng: Rng) {
      void _rng;
      if (isDiscardPhase(legal)) {
        return chooseNaiveDiscard(view, seat, legal);
      }

      const { knock, stock, discardTop } = turnMoves(legal);
      const hand = view.hands[seat] ?? [];

      if (knock && handValue(hand, view.rules) >= params.knockAt) return knock;

      if (discardTop && stock) {
        const top = view.discard[0];
        const mySuit = bestSuit(hand)?.suit;
        // obvious match: the top card belongs to my strongest suit and helps
        if (top !== undefined && mySuit !== undefined && suitOf(top) === mySuit) {
          if (bestSwap(hand, top, view.rules).gain > 0) return discardTop;
        }
        return stock;
      }

      return stock ?? knock ?? null;
    },
  };
}
