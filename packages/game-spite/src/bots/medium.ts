import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import { isWildCard, QUEEN, spiteFace } from '../cards';
import type { SpiteState } from '../state';
import {
  buildOptions,
  discardOptions,
  keepScore,
  type BuildOption,
  type DiscardOption,
} from './evaluate';
import { MEDIUM_PARAMS, type BotParams } from './shared';

/**
 * Shared scoring for the thinking tiers. The payoff pile is the win condition,
 * so plays that come off it dominate; completing a pile scores high because it
 * retires the centre and recycles every card back into reach.
 */
export function scoreBuild(
  view: SpiteState,
  seat: number,
  option: BuildOption,
  params: BotParams,
  rng: Rng,
): number {
  let score = 10;
  if (option.source.kind === 'payoff') {
    score += params.payoffDrive;
  } else if (option.source.kind === 'discard') {
    // Clearing clutter off your own table is quietly worth something.
    score += 8;
  }

  const payoffTop = view.payoffs[seat]?.[0];
  if (payoffTop !== undefined) {
    const chainRank = isWildCard(payoffTop) ? null : spiteFace(payoffTop).meta.value;
    if (chainRank === null || option.rank <= chainRank) score += 12;
    else score -= 5;
  }

  if (option.rank >= QUEEN) score += 30;

  if (option.wild && option.source.kind === 'hand') score -= params.wildHold;
  return score + rng.float() * params.noise;
}

/**
 * Dumps the card least likely to matter next turn. With `runKeep` it stacks
 * deliberately: a card placed on a top exactly one higher leaves a descending
 * pair it can unload back-to-back later.
 */
export function chooseDiscard(
  view: SpiteState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  runKeep: number,
): LegalMove | null {
  const options = discardOptions(view, legal);
  if (options.length === 0) return null;

  let best: DiscardOption | undefined;
  let bestScore = -Infinity;
  for (const option of options) {
    // Never volunteer a wild while anything else can go instead.
    let score = -keepScore(view, option.card) - (isWildCard(option.card) ? 25 : 0);
    score += rng.float() * Math.max(1, 8 - runKeep / 4);
    const pileTop = view.discards[seat]?.[option.pile]?.[0];
    if (!isWildCard(option.card) && pileTop !== undefined && !isWildCard(pileTop)) {
      if (spiteFace(pileTop).meta.value === spiteFace(option.card).meta.value + 1) {
        score += runKeep;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best?.move ?? null;
}

/**
 * Medium: chases its own payoff pile over hand and discards, completes piles
 * when it can, and throws away whatever no centre pile wants.
 */
export function makeMediumBot(
  params: BotParams = MEDIUM_PARAMS,
  id = 'spite-medium',
  label = 'Medium',
): BotPolicy<SpiteState> {
  return {
    id,
    label,
    tier: 2,
    chooseMove(view, seat, legal, rng) {
      const builds = buildOptions(view, legal, seat);
      if (builds.length > 0) {
        let best = builds[0]!;
        let bestScore = -Infinity;
        for (const option of builds) {
          const score = scoreBuild(view, seat, option, params, rng);
          if (score > bestScore) {
            bestScore = score;
            best = option;
          }
        }
        return best.move;
      }
      return chooseDiscard(view, seat, legal, rng, params.runKeep);
    },
  };
}
