import type { BotPolicy, LegalMove, PersonaMeta, Rng, SeatId } from '@parlour/engine';
import type { PinochleState } from '../state';
import { decideBid, type BidParams } from './bid';
import { handStrength } from './evaluate';
import { decidePlay, type PlayParams } from './play';

export interface BotProfile {
  bid: BidParams;
  play: PlayParams;
}

export const EASY_PROFILE: BotProfile = {
  bid: { bidCeilingFactor: 0.8, jitterAmount: 6 },
  play: { leadTrumpAggression: 0.2, duckToPartner: 0.5 },
};

export const MEDIUM_PROFILE: BotProfile = {
  bid: { bidCeilingFactor: 1.0, jitterAmount: 3 },
  play: { leadTrumpAggression: 0.4, duckToPartner: 0.7 },
};

export const HARD_PROFILE: BotProfile = {
  bid: { bidCeilingFactor: 1.15, jitterAmount: 1 },
  play: { leadTrumpAggression: 0.55, duckToPartner: 0.9 },
};

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  if (tier === 1) return EASY_PROFILE;
  if (tier === 2) return MEDIUM_PROFILE;
  return HARD_PROFILE;
}

function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Dispatches a legal-move set to the right decision helper for its shape. */
export function chooseFromProfile(
  state: PinochleState,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;
  const kind = legal[0]!.id;

  if (kind === 'confirmMeld') return legal[0]!;

  if (kind === 'nameTrump') {
    const { suit } = handStrength(state.hands[seat] ?? []);
    const match = legal.find(
      (move) => (move.payload as { suit?: string } | undefined)?.suit === suit,
    );
    return match ?? legal[0]!;
  }

  if (kind === 'bid' || kind === 'pass') {
    const decision = decideBid(state, seat, profile.bid, rng);
    const match = legal.find(
      (move) => move.id === decision.move && samePayload(move.payload, decision.payload),
    );
    return match ?? legal.find((move) => move.id === 'pass') ?? legal[0]!;
  }

  if (kind === 'playCard') {
    const cards = legal.map((move) => (move.payload as { card: string }).card);
    const card = decidePlay(state, seat, cards, profile.play, rng);
    return (
      legal.find((move) => (move.payload as { card?: string } | undefined)?.card === card) ??
      legal[0]!
    );
  }

  return legal[Math.floor(rng.float() * legal.length)] ?? legal[0]!;
}

export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile,
  persona?: PersonaMeta,
): BotPolicy<PinochleState> {
  return {
    id,
    label,
    tier,
    persona,
    chooseMove(view, seat, legal, rng) {
      return chooseFromProfile(view, seat, legal, rng, profile);
    },
  };
}

export const TIER_BOTS: readonly BotPolicy<PinochleState>[] = [
  makePolicy('pinochle-easy', 'Easy', 1, EASY_PROFILE),
  makePolicy('pinochle-medium', 'Medium', 2, MEDIUM_PROFILE),
  makePolicy('pinochle-hard', 'Hard', 3, HARD_PROFILE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<PinochleState> {
  return TIER_BOTS[tier - 1] ?? (TIER_BOTS[1] as BotPolicy<PinochleState>);
}
