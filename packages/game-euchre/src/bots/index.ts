import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import type { EuchreState } from '../state';
import { decideBid, type BidParams } from './bid';
import { decidePlay, type PlayParams } from './play';

export * from './evaluate';

/** Everything a tier or persona tweaks, in one object. */
export interface BotProfile {
  bid: BidParams;
  play: PlayParams;
}

const EASY_PROFILE: BotProfile = {
  bid: {
    orderUpMin: 0,
    callMin: 0,
    aloneMin: Number.POSITIVE_INFINITY,
    partnerDealerBonus: 0,
    jitter: 0,
    naiveTrumpFloor: 2,
  },
  play: { leadTrumpAggression: 0, protectBossCards: false, eagerRuff: false },
};

const MEDIUM_PROFILE: BotProfile = {
  bid: {
    orderUpMin: 5.4,
    callMin: 5.1,
    aloneMin: 9.5,
    partnerDealerBonus: 0.8,
    jitter: 0.25,
    naiveTrumpFloor: null,
  },
  play: { leadTrumpAggression: 1, protectBossCards: true, eagerRuff: false },
};

const HARD_PROFILE: BotProfile = {
  bid: {
    orderUpMin: 5.1,
    callMin: 4.9,
    aloneMin: 8.6,
    partnerDealerBonus: 1.1,
    jitter: 0.12,
    naiveTrumpFloor: null,
  },
  play: { leadTrumpAggression: 2, protectBossCards: true, eagerRuff: true },
};

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  return tier === 1 ? EASY_PROFILE : tier === 2 ? MEDIUM_PROFILE : HARD_PROFILE;
}

/** Builds a policy from a profile. The bot reads its own hand through the
 * player view (open rooms) and public table facts only. */
export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile,
  persona?: { name: string; avatar: string; blurb: string; emotes: readonly string[] },
): BotPolicy<EuchreState> {
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

/** One decision function over a profile — bidding phases pick bids, tricks pick cards. */
export function chooseFromProfile(
  state: EuchreState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;

  if (legal.some((move) => move.id === 'orderUp' || move.id === 'callTrump')) {
    const decision = decideBid(state, seat, profile.bid, rng);
    const match = legal.find(
      (move) =>
        move.id === decision.move &&
        JSON.stringify(move.payload ?? {}) === JSON.stringify(decision.payload ?? {}),
    );
    if (match) return match;
    const pass = legal.find((move) => move.id === 'bidPass');
    if (pass) return pass;
  }

  if (legal.some((move) => move.id === 'dealerDiscard')) {
    // bury the least useful card; keep bowers, trump and aces
    const options = legal
      .map((move) => (move.payload as { card?: string })?.card ?? '')
      .filter(Boolean);
    const trump = state.trump;
    if (options.length > 1 && trump) {
      const worst = [...options].sort((a, b) => keepDesire(a, trump) - keepDesire(b, trump))[0];
      const match = legal.find(
        (move) => (move.payload as { card?: string } | undefined)?.card === worst,
      );
      if (match) return match;
    }
    return legal[0] as LegalMove;
  }

  if (legal.every((move) => move.id === 'playCard')) {
    const cards = legal
      .map((move) => (move.payload as { card?: string })?.card ?? '')
      .filter(Boolean);
    if (cards.length > 0 && state.trump) {
      const choice = decidePlay(state, seat, cards, profile.play);
      const match = legal.find(
        (move) => (move.payload as { card?: string } | undefined)?.card === choice.card,
      );
      if (match) return match;
    }
    return rng.pick(legal);
  }

  return rng.pick(legal);
}

/** How much the dealer wants to KEEP a card — burying picks the minimum. */
function keepDesire(card: string, trump: string | null): number {
  const nominal = card[0];
  const rank = Number.parseInt(card.slice(1), 10);
  let desire = Number.isInteger(rank) ? (rank === 1 ? 50 : rank === 11 ? 45 : rank) : 0;
  if (nominal && trump && nominal === trump) desire += 30;
  return desire;
}

/** The three difficulty tiers as plain policies (spec §2/§9). */
export const TIER_BOTS: readonly BotPolicy<EuchreState>[] = [
  makePolicy('euchre-easy', 'Easy', 1, EASY_PROFILE),
  makePolicy('euchre-medium', 'Medium', 2, MEDIUM_PROFILE),
  makePolicy('euchre-hard', 'Hard', 3, HARD_PROFILE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<EuchreState> {
  const bot = TIER_BOTS.find((candidate) => candidate.tier === tier);
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}
