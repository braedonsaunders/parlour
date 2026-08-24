import type { BotPolicy, LegalMove, PersonaMeta, Rng } from '@parlour/engine';
import type { SpadesState } from '../state';
import { decideBid, type BidParams } from './bid';
import { decidePlay, type PlayParams } from './play';

export { decideBid, type BidParams } from './bid';
export { decidePlay, type PlayParams } from './play';
export { expectedTricks, ownHand } from './evaluate';

export interface BotProfile {
  bid: BidParams;
  play: PlayParams;
}

const EASY_PROFILE: BotProfile = {
  bid: { aggression: 0.8, nilMax: -1, nilSpadeCap: 0, bagFear: 10, jitter: 1.2 },
  play: { coverPartner: false, eagerRuff: false, bagAvoid: false, protectNil: false },
};

const MEDIUM_PROFILE: BotProfile = {
  bid: { aggression: 0.15, nilMax: 0.4, nilSpadeCap: 1, bagFear: 8, jitter: 0.35 },
  play: { coverPartner: true, eagerRuff: true, bagAvoid: false, protectNil: true },
};

const HARD_PROFILE: BotProfile = {
  bid: { aggression: -0.05, nilMax: 0.6, nilSpadeCap: 2, bagFear: 7, jitter: 0.12 },
  play: { coverPartner: true, eagerRuff: true, bagAvoid: true, protectNil: true },
};

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  return tier === 1 ? EASY_PROFILE : tier === 2 ? MEDIUM_PROFILE : HARD_PROFILE;
}

export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile,
  persona?: PersonaMeta,
): BotPolicy<SpadesState> {
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

export function chooseFromProfile(
  state: SpadesState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;

  if (legal.some((move) => move.id === 'bid' || move.id === 'bidNil')) {
    const tricks = decideBid(state, seat, profile.bid, rng);
    if (tricks === 0) {
      const nil = legal.find((move) => move.id === 'bidNil');
      if (nil) return nil;
    }
    const match = legal.find(
      (move) =>
        move.id === 'bid' && (move.payload as { bid?: number } | undefined)?.bid === Math.max(1, tricks),
    );
    if (match) return match;
    return legal.find((move) => move.id === 'bid') ?? legal[0]!;
  }

  if (legal.every((move) => move.id === 'playCard')) {
    const cards = legal
      .map((move) => (move.payload as { card?: string } | undefined)?.card ?? '')
      .filter(Boolean);
    if (cards.length > 0) {
      const choice = decidePlay(state, seat, cards, profile.play);
      const match = legal.find(
        (move) => (move.payload as { card?: string } | undefined)?.card === choice,
      );
      if (match) return match;
    }
    return rng.pick(legal);
  }

  return rng.pick(legal);
}

export const TIER_BOTS: readonly BotPolicy<SpadesState>[] = [
  makePolicy('spades-easy', 'Easy', 1, EASY_PROFILE),
  makePolicy('spades-medium', 'Medium', 2, MEDIUM_PROFILE),
  makePolicy('spades-hard', 'Hard', 3, HARD_PROFILE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<SpadesState> {
  const bot = TIER_BOTS.find((candidate) => candidate.tier === tier);
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}
