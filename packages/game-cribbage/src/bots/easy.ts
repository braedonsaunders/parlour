import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import { cardValue } from '../cards';
import { pegPlayScore } from '../score';
import type { CribbageState } from '../state';
import { keepBaseValue } from './play';
import type { BotParams } from './params';

/**
 * Tier 1 — myopic pub novice. Keeps whatever pairs/fifteens are already in
 * hand, throws big cards at the opponent's side, plays with a coin and an
 * opinion, and forgets muggins more often than not.
 */
export function makeEasyBot(
  params: BotParams,
  id = 'cribbage-easy',
  label = 'Rookie',
): BotPolicy<CribbageState> {
  return {
    id,
    label,
    tier: 1,
    chooseMove(view: CribbageState, seat: number, legal: readonly LegalMove[], rng: Rng) {
      const claim = legal.find((move) => move.id === 'claim');
      if (claim && rng.float() < params.claimRate) return claim;
      const steal = legal.find((move) => move.id === 'steal');
      if (steal && rng.float() < params.stealRate) return steal;

      if (legal.some((move) => move.id === 'crib.discard')) {
        return easyDiscard(view, seat, legal, rng);
      }

      const plays = legal.filter((move) => move.id === 'playCard');
      if (plays.length > 0) {
        const scoring = plays.filter((move) => {
          const card = (move.payload as { card?: string }).card as string;
          return card ? pegPlayScore(view.pegging.pile, card).points > 0 : false;
        });
        if (scoring.length > 0 && rng.float() < 0.8) {
          return scoring[Math.floor(rng.float() * scoring.length)] as LegalMove;
        }
        return plays[Math.floor(rng.float() * plays.length)] as LegalMove;
      }

      return legal[0] ?? null;
    },
  };
}

function easyDiscard(
  view: CribbageState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
): LegalMove | null {
  let best: { move: LegalMove; value: number } | null = null;
  for (const move of legal) {
    if (move.id !== 'crib.discard') continue;
    const cards = (move.payload as { cards?: readonly string[] }).cards ?? [];
    const hand = view.hands[seat] ?? [];
    const keep = hand.filter((card) => !cards.includes(card));
    // immediate keep value, plus a soft nudge to dump high cards at their board
    const feed = seat === view.dealer ? 1 : -1;
    const toss = cards.reduce((total, card) => total + cardValue(card), 0);
    const value = keepBaseValue(keep) + feed * toss * 0.2 + rng.float();
    if (!best || value > best.value) best = { move, value };
  }
  return best?.move ?? null;
}
