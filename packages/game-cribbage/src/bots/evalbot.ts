import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import type { CribbageState } from '../state';
import { cribPotential, expectedKeepValue, sampleStarters, unseenCards } from './shared';
import { choosePeggingPlay, findMove, keepBaseValue } from './play';
import { HARD_PARAMS, MEDIUM_PARAMS, type BotParams } from './params';

/** Tier 2 — a solid club regular: sampled discard EV, cautious pegging. */
export function makeMediumBot(
  params: BotParams = MEDIUM_PARAMS,
  id = 'cribbage-medium',
  label = 'Regular',
): BotPolicy<CribbageState> {
  return makeEvalBot(params, 2, id, label);
}

/** Tier 3 — sharp: deeper sampling, position-aware throws and trap-aware pegging. */
export function makeHardBot(
  params: BotParams = HARD_PARAMS,
  id = 'cribbage-hard',
  label = 'Sharp',
): BotPolicy<CribbageState> {
  return makeEvalBot(params, 3, id, label);
}

/**
 * Tiered factory shared by the medium and hard policies: EV discard over
 * sampled starters with a crib-direction term, then the shared pegging
 * evaluator plus disciplined muggins handling.
 */
export function makeEvalBot(
  params: BotParams,
  tier: 2 | 3,
  id: string,
  label: string,
): BotPolicy<CribbageState> {
  return {
    id,
    label,
    tier,
    chooseMove(view: CribbageState, seat: number, legal: readonly LegalMove[], rng: Rng) {
      const claim = findMove(legal, 'claim');
      if (claim && rng.float() < params.claimRate) return claim;
      const steal = findMove(legal, 'steal');
      if (steal && rng.float() < params.stealRate) return steal;

      if (findMove(legal, 'crib.discard')) return evalDiscard(view, seat, legal, rng, params);
      if (findMove(legal, 'playCard')) {
        return choosePeggingPlay(view, seat, legal, rng, params);
      }
      return legal[0] ?? null;
    },
  };
}

function evalDiscard(
  view: CribbageState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  params: BotParams,
): LegalMove | null {
  const pool = unseenCards(view, seat);
  const starters = sampleStarters(pool, rng, params.starterSamples);
  const ownCrib = seat === view.dealer;
  // points still needed to land on 121 — close races prize guaranteed keep value
  const needed = Math.max(1, 121 - (view.totals[seat] ?? 0));

  let best: { move: LegalMove; value: number } | null = null;
  for (const move of legal) {
    if (move.id !== 'crib.discard') continue;
    const cards = (move.payload as { cards?: readonly string[] }).cards ?? [];
    const hand = view.hands[seat] ?? [];
    const keep = hand.filter((card) => !cards.includes(card));
    const keepEv = expectedKeepValue(keep, starters);
    const pairBonus = (cards[0] as string).slice(1) === (cards[1] as string).slice(1) ? 2 : 0;
    const cribTerm =
      (ownCrib ? 1 : -1) * cribPotential(cards as [string, string]) * params.cribWeight +
      (ownCrib ? 0.6 : -0.4) * pairBonus;
    // when the game is on the line, prefer keeps that already score without help
    const urgency = needed <= 12 ? 0.5 : needed >= 60 ? 0 : 0.2;
    const value = keepEv + cribTerm + urgency * keepBaseValue(keep) + rng.float() * 0.3;
    if (!best || value > best.value) best = { move, value };
  }
  return best?.move ?? null;
}
