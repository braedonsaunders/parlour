import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { bestPartition } from '../melds';
import type { GinState } from '../state';
import {
  discardMoves,
  safeDiscard,
  type GinBotParams,
} from './shared';
import { drawOptions } from './view';

/**
 * Tier 2 "Medium" — projects every draw source, keeps a light memory of the
 * opponent's pickups for safer discards, and banks knocks the moment the hand
 * qualifies under its threshold.
 */
export function makeMediumBot(
  params: GinBotParams,
  id = 'gin-medium',
  label = 'Medium',
): BotPolicy<GinState> {
  return {
    id,
    label,
    tier: 2,
    chooseMove(view: GinState, seat: SeatId, legal: readonly LegalMove[], rng: Rng) {
      const ctx = { view, seat, params, rng };
      const current = bestPartition(view.hands[seat] ?? []).deadwood;
      const knock = legal.find((move) => move.id === 'knock');

      // opening upcard decision
      const take = legal.find((move) => move.id === 'option.take');
      const pass = legal.find((move) => move.id === 'option.pass');
      if (take && pass) {
        const probe = drawOptions(ctx);
        if (probe.discard && probe.stock && probe.discard.gain >= Math.max(1, probe.stock.gain)) {
          return take;
        }
        return pass;
      }

      const discards = discardMoves(legal);
      if (discards.length > 0) {
        if (knock && current <= params.knockAt) return knock;
        return safeDiscard(ctx, discards);
      }

      const options = drawOptions(ctx);
      const stock = legal.find((move) => move.id === 'draw.stock');
      const drawDiscard = legal.find((move) => move.id === 'draw.discard');

      if (options.discard && drawDiscard && stock) {
        // taking must clearly beat the average stock swing to be worth the tell
        if (options.discard.gain >= Math.max(1, options.stock.gain)) return drawDiscard;
      }
      return stock ?? knock ?? drawDiscard ?? null;
    },
  };
}
