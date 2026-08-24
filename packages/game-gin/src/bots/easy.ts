import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { bestPartition } from '../melds';
import type { GinState } from '../state';
import { discardMoves, payloadCard, type GinBotParams } from './shared';
import { drawOptions } from './view';

/**
 * Tier 1 "Easy" — myopic: takes obvious improvements, throws the biggest
 * deadwood card, knocks only when the hand sits well under the cap. Never
 * reads the opponent.
 */
export function makeEasyBot(
  params: GinBotParams,
  id = 'gin-easy',
  label = 'Easy',
): BotPolicy<GinState> {
  return {
    id,
    label,
    tier: 1,
    chooseMove(view: GinState, seat: SeatId, legal: readonly LegalMove[], _rng: Rng) {
      const hand = view.hands[seat] ?? [];
      const current = bestPartition(hand).deadwood;

      const options = drawOptions({ view, seat, params, rng: _rng });

      // opening upcard decision
      const take = legal.find((move) => move.id === 'option.take');
      const pass = legal.find((move) => move.id === 'option.pass');
      if (take && pass) {
        return options.discard && options.discard.gain >= 2 ? take : pass;
      }

      const discards = discardMoves(legal);
      if (discards.length > 0) {
        const knock = legal.find((move) => move.id === 'knock');
        if (knock && current <= params.knockAt) return knock;
        return worstThrow(discards);
      }

      void cardPoints;
      const drawDiscard = legal.find((move) => move.id === 'draw.discard');
      // takes must clearly pay — no polite trading of the same ten points
      if (drawDiscard && options.discard && options.discard.gain >= 2) {
        return drawDiscard;
      }
      return legal.find((move) => move.id === 'draw.stock') ?? null;
    },
  };
}

function worstThrow(discards: readonly LegalMove[]): LegalMove | null {
  let worst = discards[0] ?? null;
  let worstValue = -1;
  for (const move of discards) {
    const card = payloadCard(move);
    if (card === null) continue;
    const value = cardPoints(card);
    if (value > worstValue) {
      worstValue = value;
      worst = move;
    }
  }
  return worst;
}

function cardPoints(card: string): number {
  const rank = Number(card.slice(1));
  return Math.min(Number.isFinite(rank) ? Math.max(rank, 1) : 1, 10);
}
