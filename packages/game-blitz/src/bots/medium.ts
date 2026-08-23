import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { handValue, pipValue } from '../hand';
import type { BlitzState } from '../state';
import { bestSwap, inferOpponents, stockDrawEv } from './evaluate';
import { chooseSafeDiscard, isDiscardPhase, turnMoves, type BotParams } from './shared';

/**
 * Tier 2 "Medium" (spec §9): tracks what opponents have drawn from the discard
 * pile (suit inference), avoids dangerous discards, knocks in the ~21–26 band
 * adjusted by how much of the table is already visible.
 */
export function makeMediumBot(
  params: BotParams,
  id = 'medium',
  label = 'Medium',
): BotPolicy<BlitzState> {
  return {
    id,
    label,
    tier: 2,
    chooseMove(view: BlitzState, seat: SeatId, legal: readonly LegalMove[], _rng: Rng) {
      void _rng;
      if (isDiscardPhase(legal)) {
        return chooseSafeDiscard(view, seat, legal, params.memory);
      }

      const { knock, stock, discardTop } = turnMoves(legal);
      const hand = view.hands[seat] ?? [];
      const value = handValue(hand, view.rules);

      if (knock && shouldKnock(view, seat, value, params)) return knock;

      // exact gain from the known discard top vs expected gain off the stock
      if (discardTop && stock) {
        const top = view.discard[0]!;
        const takeGain = bestSwap(hand, top, view.rules).gain;
        const { ev } = stockDrawEv(view, seat);
        if (takeGain > 0 && takeGain >= ev) return discardTop;
      }

      return stock ?? knock ?? null;
    },
  };
}

/** ~21–24 base band, nudged by visible cards and opponent appetite. */
function shouldKnock(view: BlitzState, seat: SeatId, value: number, params: BotParams): boolean {
  if (value < 21) return false;

  let threshold = params.knockAt;

  // more of the deck is on the table → less upside hiding in the stock
  const seen = view.discard.length + (view.hands[seat] ?? []).length;
  if (seen >= 8) threshold -= 1;

  // an opponent just took a big card — they may be closer than they look
  for (const insight of inferOpponents(view, seat)) {
    if (insight.latest && pipValue(insight.latest) >= 10) threshold += 1;
  }

  return value >= Math.max(21, Math.min(26, threshold));
}
