import type { BotPolicy } from '@parlour/engine';
import { rankOf, suitOf } from '../cards';
import type { DurakState } from '../state';
import { bestBy, cardCost, firstOf, ownHand, payloadCard, rankCount } from './evaluate';
import { regularPersona, rookiePersona, sharpPersona } from './personas';

/**
 * Durak's tier ladder — three policies that beat and throw in with increasing
 * awareness of what a card costs to give up.
 */

const easyBot: BotPolicy<DurakState> = {
  id: 'durak-easy',
  label: 'Easy',
  tier: 1,
  persona: rookiePersona,
  chooseMove(_view, _seat, legal, rng) {
    const defends = legal.filter((move) => move.id === 'defend');
    if (defends.length > 0 && rng.float() < 0.85) {
      return defends[rng.int(defends.length)] ?? null;
    }
    const attacks = legal.filter((move) => move.id === 'attack');
    if (attacks.length > 0 && rng.float() < 0.7) {
      return attacks[rng.int(attacks.length)] ?? null;
    }
    return legal[rng.int(legal.length)] ?? null;
  },
};

/**
 * Beats with the cheapest card that works, throws in the cheapest card it can,
 * and keeps trumps for when nothing else will beat an attack.
 */
const mediumBot: BotPolicy<DurakState> = {
  id: 'durak-medium',
  label: 'Regular',
  tier: 2,
  persona: regularPersona,
  chooseMove(view, _seat, legal, rng) {
    const defends = legal.filter((move) => move.id === 'defend');
    if (defends.length > 0) {
      return bestBy(defends, rng, (move) => -cardCost(payloadCard(move)!, view.trumpSuit));
    }
    const attacks = legal.filter((move) => move.id === 'attack');
    if (attacks.length > 0) {
      return bestBy(attacks, rng, (move) => -cardCost(payloadCard(move)!, view.trumpSuit));
    }
    return firstOf(legal, 'transfer', 'pass', 'takeCards') ?? legal[0] ?? null;
  },
};

/**
 * Sharp bot: beats as cheaply as possible, and when attacking prefers ranks it
 * holds more than one of — a duplicate thrown in costs nothing extra to hold
 * and pins the defender for another round of the same rank. Trumps only come
 * out when there is nothing cheaper to spend.
 */
const hardBot: BotPolicy<DurakState> = {
  id: 'durak-hard',
  label: 'Sharp',
  tier: 3,
  persona: sharpPersona,
  chooseMove(view, seat, legal, rng) {
    const defends = legal.filter((move) => move.id === 'defend');
    if (defends.length > 0) {
      return bestBy(defends, rng, (move) => -cardCost(payloadCard(move)!, view.trumpSuit));
    }
    const attacks = legal.filter((move) => move.id === 'attack');
    if (attacks.length > 0) {
      const hand = ownHand(view, seat);
      return bestBy(attacks, rng, (move) => {
        const card = payloadCard(move)!;
        const duplicates = rankCount(hand, rankOf(card));
        const trumpPenalty = suitOf(card) === view.trumpSuit ? 60 : 0;
        return duplicates * 12 - cardCost(card, view.trumpSuit) - trumpPenalty;
      });
    }
    return firstOf(legal, 'transfer', 'pass', 'takeCards') ?? legal[0] ?? null;
  },
};

export { easyBot, mediumBot, hardBot };

export const DURAK_BOTS: readonly BotPolicy<DurakState>[] = [easyBot, mediumBot, hardBot];

export function durakTierBot(tier: 1 | 2 | 3): BotPolicy<DurakState> {
  const bot = DURAK_BOTS[tier - 1];
  if (!bot) throw new Error(`no Durak bot for tier ${tier}`);
  return bot;
}
