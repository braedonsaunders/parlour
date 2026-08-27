import type { BotPolicy } from '@parlour/engine';
import { phaseFor } from '../game';
import type { PalaceState } from '../state';
import { cheapest, chooseSwapPairs, downCandidates, pickupMove, playCandidates } from './evaluate';
import { regularPersona, rookiePersona, sharpPersona } from './personas';

/**
 * Palace tier ladder — three policies that get smarter with each step.
 *
 * Easy dumps whatever is legal with little regard for cost. Medium spends
 * ordinary ranks first and hoards specials. Hard does the same but also
 * swaps its face-up row deliberately and dumps whole groups to shed faster.
 */

const easyBot: BotPolicy<PalaceState> = {
  id: 'palace-easy',
  label: 'Rookie',
  tier: 1,
  persona: rookiePersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'swap') {
      const canSwap = legal.some((move) => move.id === 'swap');
      return canSwap && rng.float() >= 0.7
        ? { id: 'swap', payload: { pairs: [] } }
        : { id: 'ready' };
    }
    const plays = playCandidates(legal);
    if (plays.length > 0) {
      const pick = rng.float() < 0.8 ? plays[0]! : (rng.pick(plays) ?? plays[0]!);
      return pick.move;
    }
    const downs = downCandidates(legal);
    if (downs.length > 0) return rng.pick(downs);
    return pickupMove(legal) ?? legal[0] ?? null;
  },
};

const mediumBot: BotPolicy<PalaceState> = {
  id: 'palace-medium',
  label: 'Regular',
  tier: 2,
  persona: regularPersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'swap') {
      if (!legal.some((move) => move.id === 'swap')) return { id: 'ready' };
      const pairs = chooseSwapPairs(view, seat, 1);
      return pairs.length > 0 ? { id: 'swap', payload: { pairs } } : { id: 'ready' };
    }
    const plays = playCandidates(legal);
    const pick = cheapest(plays);
    if (pick) return pick.move;
    const downs = downCandidates(legal);
    if (downs.length > 0) return rng.pick(downs);
    return pickupMove(legal) ?? legal[0] ?? null;
  },
};

const hardBot: BotPolicy<PalaceState> = {
  id: 'palace-hard',
  label: 'Sharp',
  tier: 3,
  persona: sharpPersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'swap') {
      if (!legal.some((move) => move.id === 'swap')) return { id: 'ready' };
      const pairs = chooseSwapPairs(view, seat, 3);
      return pairs.length > 0 ? { id: 'swap', payload: { pairs } } : { id: 'ready' };
    }
    const plays = playCandidates(legal);
    const pick = cheapest(plays);
    if (pick) {
      // Dump the whole group when it is cheap or completes a burn — shedding
      // faster is worth more than holding spares once the rank is spent anyway.
      const group = plays.find(
        (candidate) => candidate.rank === pick.rank && candidate.size > pick.size,
      );
      return (group ?? pick).move;
    }
    const downs = downCandidates(legal);
    if (downs.length > 0) return rng.pick(downs);
    return pickupMove(legal) ?? legal[0] ?? null;
  },
};

export { easyBot as easyPalaceBot, mediumBot as mediumPalaceBot, hardBot as hardPalaceBot };

export const palaceBots: readonly BotPolicy<PalaceState>[] = [easyBot, mediumBot, hardBot];

export function palaceTierBot(tier: 1 | 2 | 3): BotPolicy<PalaceState> {
  const bot = [easyBot, mediumBot, hardBot][tier - 1];
  if (!bot) throw new Error(`no Palace bot for tier ${tier}`);
  return bot;
}
