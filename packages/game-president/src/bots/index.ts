import type { BotPolicy } from '@parlour/engine';
import { phaseFor, handOf } from '../game';
import type { PresidentState } from '../state';
import {
  candidateScore,
  chooseScored,
  exchangePayload,
  groupCounts,
  passMove,
  rivalsMinHand,
  setCandidates,
  type ScoreWeights,
} from './evaluate';
import { regularPersona, rookiePersona, sharpPersona } from './personas';
import { TWO_ORDER } from '../deck';

/**
 * President tier ladder — three policies that get smarter with each step.
 *
 * Easy plays the cheapest set and tries not to think about it. Medium preserves
 * groups, manages 2s, and dumps junk during the exchange. Hard tracks what
 * everyone is holding, times its passes, and saves power for the endgame.
 */

const easyBot: BotPolicy<PresidentState> = {
  id: 'president-easy',
  label: 'Rookie',
  tier: 1,
  persona: rookiePersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'exchange-give') return exchangePayload(view, seat, 'best', false, rng);
    if (phase === 'exchange-return') return exchangePayload(view, seat, 'worst', false, rng);

    const sets = setCandidates(legal);
    if (sets.length === 0) return passMove(legal);
    sets.sort((a, b) => a.rank - b.rank || a.size - b.size);
    if (rng.float() < 0.85) return sets[0]!.move;
    return (rng.pick(sets) ?? sets[0]!).move;
  },
};

const mediumBot: BotPolicy<PresidentState> = {
  id: 'president-medium',
  label: 'Regular',
  tier: 2,
  persona: regularPersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'exchange-give') return exchangePayload(view, seat, 'best', false, rng);
    if (phase === 'exchange-return') return exchangePayload(view, seat, 'worst', true, rng);

    const racing = handOf(view, seat).length <= 3;
    const weights: ScoreWeights = racing
      ? { rankWeight: 3, breakWeight: 1, twoCost: 8 }
      : { rankWeight: 2, breakWeight: 6, twoCost: 26 };
    const threshold = racing ? null : 34;
    return chooseScored(view, seat, legal, weights, threshold);
  },
};

const hardBot: BotPolicy<PresidentState> = {
  id: 'president-hard',
  label: 'Sharp',
  tier: 3,
  persona: sharpPersona,
  chooseMove(view, seat, legal, rng) {
    const phase = phaseFor(view).phase;
    if (phase === 'exchange-give') return exchangePayload(view, seat, 'best', true, rng);
    if (phase === 'exchange-return') return exchangePayload(view, seat, 'worst', true, rng);

    const handSize = handOf(view, seat).length;
    const rivalMin = rivalsMinHand(view, seat);
    const racing = handSize <= Math.max(3, rivalMin);

    const sets = setCandidates(legal);
    if (sets.length === 0) return passMove(legal);
    const counts = groupCounts(handOf(view, seat));

    const scored = sets.map((candidate) => {
      let score = candidateScore(
        candidate,
        counts,
        racing
          ? { rankWeight: 4, breakWeight: 0.5, twoCost: 6 }
          : { rankWeight: 2.5, breakWeight: 7, twoCost: 30 },
      );
      if (candidate.size === handSize) score -= 500; // going out this beat wins the deal
      if (!racing && rivalMin <= 2 && candidate.rank >= TWO_ORDER - 3) {
        score += 10; // shed power while the race is on
      }
      return { candidate, score };
    });
    scored.sort((a, b) => a.score - b.score || a.candidate.rank - b.candidate.rank);
    const cheapest = scored[0]!;

    if (view.standing && !racing) {
      const holdThreshold = rivalMin <= 1 ? 60 : 38;
      if (cheapest.score > holdThreshold) {
        const pass = passMove(legal);
        if (pass) return pass;
      }
    }
    return cheapest.candidate.move;
  },
};

export { easyBot as easyPresidentBot, mediumBot as mediumPresidentBot, hardBot as hardPresidentBot };

export const presidentBots: readonly BotPolicy<PresidentState>[] = [easyBot, mediumBot, hardBot];

export function presidentTierBot(tier: 1 | 2 | 3): BotPolicy<PresidentState> {
  const bot = [easyBot, mediumBot, hardBot][tier - 1];
  if (!bot) throw new Error(`no President bot for tier ${tier}`);
  return bot;
}