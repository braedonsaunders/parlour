import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { bestPartition } from '../melds';
import type { GinState } from '../state';
import { discardMoves, distanceToGin, safeDiscard, type GinBotParams } from './shared';
import { discardDanger, drawOptions, knockSurvival } from './view';

const SURVIVAL_SAMPLES = 40;

/**
 * Tier 3 "Hard" — EV draw choices, Monte-Carlo knock timing with layoff
 * awareness and inference-fed samples, plus danger-scored discards that refuse
 * to feed exactly what the opponent has shown an appetite for.
 */
export function makeHardBot(
  params: GinBotParams,
  id = 'gin-hard',
  label = 'Hard',
): BotPolicy<GinState> {
  return {
    id,
    label,
    tier: 3,
    chooseMove(view: GinState, seat: SeatId, legal: readonly LegalMove[], rng: Rng) {
      const ctx = { view, seat, params, rng };
      const hand = view.hands[seat] ?? [];
      const current = bestPartition(hand).deadwood;
      const knock = legal.find((move) => move.id === 'knock');

      // opening upcard decision
      const take = legal.find((move) => move.id === 'option.take');
      const pass = legal.find((move) => move.id === 'option.pass');
      if (take && pass) {
        const probe = drawOptions(ctx);
        const probeTake = probe.discard;
        const upcard = probeTake?.card;
        if (probeTake && upcard !== undefined && upcard !== null) {
          const appetite = discardDanger(ctx, upcard);
          if (
            probeTake.gain + appetite * 0.15 >= Math.max(0.75, probe.stock.gain) ||
            (appetite >= 2.4 && probeTake.gain >= -1)
          ) {
            return take;
          }
        }
        return pass;
      }

      const discards = discardMoves(legal);
      if (discards.length > 0) {
        if (knock && current <= params.knockAt && params.knockProb !== null) {
          const ginDistance = distanceToGin(hand);
          // a one-card gin line is worth chasing only early, and never from
          // a hand that already knocks safely
          const ginViable =
            params.chaseGin && ginDistance === 1 && current >= 6 && view.stock.length > 18;
          if (!ginViable && current <= 5) return knock;
          const losesOrUndercuts = knockSurvival(ctx, current, SURVIVAL_SAMPLES);
          const knockBar = 1 - params.knockProb;
          if (losesOrUndercuts <= knockBar || (!ginViable && losesOrUndercuts < 0.55)) {
            return knock;
          }
        }
        return safeDiscard(ctx, discards);
      }

      const options = drawOptions(ctx);
      const stock = legal.find((move) => move.id === 'draw.stock');
      const drawDiscard = legal.find((move) => move.id === 'draw.discard');

      if (options.discard?.card !== undefined && drawDiscard && stock) {
        const upcard = options.discard.card as string;
        const appetite = discardDanger(ctx, upcard);
        if (options.discard.gain + appetite * 0.15 >= Math.max(0.75, options.stock.gain)) {
          return drawDiscard;
        }
        // denial: swipe a visibly-wanted card even at break-even
        if (appetite >= 2.4 && options.discard.gain >= -1 && options.stock.gain < 2) {
          return drawDiscard;
        }
      }

      return stock ?? knock ?? drawDiscard ?? null;
    },
  };
}
