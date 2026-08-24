import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import { choosePassCards, legalPlayCards, pickPlay } from './shared';
import type { HeartsState } from '../state';

/**
 * Tier 2 — "Careful". Passes poison and hunts voids, ducks under winners,
 * dumps the queen when void, leads low and safe. No moon awareness.
 */
export const mediumBot: BotPolicy<HeartsState> = {
  id: 'hearts-medium',
  label: 'Careful',
  tier: 2,
  chooseMove(state, seat, legal, rng): LegalMove | null {
    if (legal.length === 0) return null;
    const move = legal[0]!;
    if (move.id === 'passCards') {
      return {
        id: 'passCards',
        payload: { cards: choosePassCards(state, seat, 3, rng, 2) },
      };
    }
    if (move.id === 'playCard') {
      const cards = legalPlayCards(legal);
      const card = pickPlay({ state, seat, cards, tier: 2, rng }) ?? cards[0];
      return card ? { id: 'playCard', payload: { card } } : move;
    }
    return move;
  },
};
