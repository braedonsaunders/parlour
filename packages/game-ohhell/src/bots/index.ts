import type { BotPolicy, LegalMove, PersonaMeta, Rng } from '@parlour/engine';
import { SUITS, suitOfCard } from '../cards';
import type { OhHellState } from '../state';
import { decideBid, decidePlay, type BidParams, type PlayParams } from './play';

export { decideBid, type BidParams } from './play';
export { decidePlay, type PlayParams } from './play';
export { bidEstimate, naiveEstimate, ownHand, voidMap } from './evaluate';

export interface BotProfile {
  bid: BidParams;
  play: PlayParams;
}

const EASY_PROFILE: BotProfile = {
  bid: { counter: false, aggression: 0.3, jitter: 1.1, hookAware: false },
  play: { random: true, chase: false, dumpLosers: false, voidAware: false, holdWizards: false },
};

const MEDIUM_PROFILE: BotProfile = {
  bid: { counter: false, aggression: 0.15, jitter: 0.4, hookAware: false },
  play: { random: false, chase: true, dumpLosers: true, voidAware: false, holdWizards: false },
};

const HARD_PROFILE: BotProfile = {
  bid: { counter: true, aggression: -0.05, jitter: 0.12, hookAware: true },
  play: { random: false, chase: true, dumpLosers: true, voidAware: true, holdWizards: true },
};

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  return tier === 1 ? EASY_PROFILE : tier === 2 ? MEDIUM_PROFILE : HARD_PROFILE;
}

function chooseFromProfile(
  view: OhHellState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;

  const trumpChoices = legal.filter((move) => move.id === 'chooseTrump');
  if (trumpChoices.length > 0) {
    // Take trump in the longest suit actually held; fall back to the first offer.
    const held = new Map<string, number>();
    for (const card of view.hands[seat] ?? []) {
      const suit = suitOfCard(card);
      if (suit) held.set(suit, (held.get(suit) ?? 0) + 1);
    }
    const best = [...SUITS].sort((a, b) => (held.get(b) ?? 0) - (held.get(a) ?? 0))[0];
    return (
      trumpChoices.find((move) => (move.payload as { suit?: string }).suit === best) ?? legal[0]!
    );
  }

  const bidMoves = legal.filter((move) => move.id === 'bid');
  if (bidMoves.length > 0) {
    const candidates = bidMoves
      .map((move) => (move.payload as { bid?: unknown }).bid)
      .filter((value): value is number => typeof value === 'number');
    const value = decideBid(view, seat, candidates, profile.bid, rng);
    return (
      bidMoves.find((move) => (move.payload as { bid?: number }).bid === value) ??
      rng.pick(bidMoves)
    );
  }

  if (legal.every((move) => move.id === 'playCard')) {
    const cards = legal
      .map((move) => (move.payload as { card?: unknown }).card)
      .filter((card): card is string => typeof card === 'string');
    if (cards.length > 0) {
      const choice = decidePlay(view, seat, cards, profile.play, rng);
      const match = legal.find((move) => (move.payload as { card?: string }).card === choice);
      if (match) return match;
    }
    return rng.pick(legal);
  }

  return rng.pick(legal);
}

export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile,
  persona?: PersonaMeta,
): BotPolicy<OhHellState> {
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

export const TIER_BOTS: readonly BotPolicy<OhHellState>[] = [
  makePolicy('ohhell-easy', 'Easy', 1, EASY_PROFILE),
  makePolicy('ohhell-medium', 'Medium', 2, MEDIUM_PROFILE),
  makePolicy('ohhell-hard', 'Hard', 3, HARD_PROFILE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<OhHellState> {
  const bot = TIER_BOTS.find((candidate) => candidate.tier === tier);
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}
