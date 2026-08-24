import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import { choosePassCards, legalPlayCards, pickPlay } from './shared';
import type { HeartsState } from '../state';

/**
 * Tier 1 — "Harmless". Plays the middle of what it holds, passes almost at
 * random, never tracks the queen. Exists to lose gracefully and teach new
 * players the table rhythm.
 */
export const easyBot: BotPolicy<HeartsState> = {
  id: 'hearts-easy',
  label: 'Harmless',
  tier: 1,
  chooseMove(state, seat, legal, rng): LegalMove | null {
    if (legal.length === 0) return null;
    const move = legal[0]!;
    if (move.id === 'passCards') {
      return {
        id: 'passCards',
        payload: { cards: choosePassCards(state, seat, 3, rng, 1) },
      };
    }
    if (move.id === 'playCard') {
      const cards = legalPlayCards(legal);
      const card = pickPlay({ state, seat, cards, tier: 1, rng }) ?? cards[0];
      return card ? { id: 'playCard', payload: { card } } : move;
    }
    return move;
  },
};

export function makeEasyBot(): BotPolicy<HeartsState> {
  return easyBot;
}

export type { Rng };
