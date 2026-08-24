import type { LegalMove } from '@parlour/engine';
import { bestPartition } from '../melds';
import { discardDanger } from './view';
import type { BrainContext, GinBotParams } from './params';

export type { GinBotParams };

export function payloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

export function discardMoves(legal: readonly LegalMove[]): LegalMove[] {
  return legal.filter((move) => move.id === 'discard');
}

/**
 * Danger-aware throwaway: minimize resulting deadwood first, then avoid the
 * cards the opponent's pickups say they want.
 */
export function safeDiscard(ctx: BrainContext, discards: readonly LegalMove[]): LegalMove | null {
  const hand = ctx.view.hands[ctx.seat] ?? [];
  let best = discards[0] ?? null;
  let bestScore = -Infinity;
  for (const move of discards) {
    const card = payloadCard(move);
    if (card === null) continue;
    const rest = hand.filter((held) => held !== card);
    const deadwood = bestPartition(rest).deadwood;
    const score = -deadwood * 10 - discardDanger(ctx, card);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

/** cards still unmelded in the best partition — 0 means gin */
export function distanceToGin(hand: readonly string[]): number {
  return bestPartition(hand).deadwoodCards.length;
}
