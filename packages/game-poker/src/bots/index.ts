import type { BotPolicy, LegalMove, PersonaMeta, Rng, SeatId } from '@parlour/engine';
import type { PokerState } from '../state';
import { decideAction, type BotProfile } from './decide';

export { decideAction, type BotProfile } from './decide';
export { chenScore, equity, preflopStrength, strengthNow } from './strength';

/**
 * Easy plays too many hands and reads the board through forty noisy samples, so
 * it talks itself into calls a better player would not make. It is not told to
 * blunder — it is simply not looking very hard.
 */
const EASY_PROFILE: BotProfile = {
  samples: 30,
  entryRatio: -0.16,
  preflopRaiseRatio: 0.36,
  postflopRaiseRatio: 0.42,
  callMargin: -0.26,
  aggression: 0.3,
  bluff: 0.03,
};

const MEDIUM_PROFILE: BotProfile = {
  samples: 140,
  entryRatio: 0.02,
  preflopRaiseRatio: 0.24,
  postflopRaiseRatio: 0.3,
  callMargin: 0.0,
  aggression: 0.5,
  bluff: 0.08,
};

const HARD_PROFILE: BotProfile = {
  samples: 320,
  entryRatio: 0.06,
  preflopRaiseRatio: 0.17,
  postflopRaiseRatio: 0.23,
  callMargin: 0.03,
  aggression: 0.65,
  bluff: 0.12,
};

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  return tier === 1 ? EASY_PROFILE : tier === 2 ? MEDIUM_PROFILE : HARD_PROFILE;
}

export function chooseFromProfile(
  state: PokerState,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  return decideAction(state, seat, legal, rng, profile);
}

export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile,
  persona?: PersonaMeta,
): BotPolicy<PokerState> {
  return {
    id,
    label,
    tier,
    ...(persona ? { persona } : {}),
    chooseMove(view, seat, legal, rng) {
      return chooseFromProfile(view, seat, legal, rng, profile);
    },
  };
}

export const TIER_BOTS: readonly BotPolicy<PokerState>[] = [
  makePolicy('poker-easy', 'Loose', 1, EASY_PROFILE),
  makePolicy('poker-medium', 'Steady', 2, MEDIUM_PROFILE),
  makePolicy('poker-hard', 'Sharp', 3, HARD_PROFILE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<PokerState> {
  return TIER_BOTS.find((bot) => bot.tier === tier) as BotPolicy<PokerState>;
}
