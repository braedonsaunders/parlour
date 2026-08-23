import type { BotPolicy, LegalMove, Rng, SeatId } from '@parlour/engine';
import { handValue, pipValue, suitOf } from '../hand';
import type { BlitzState } from '../state';
import { bestSwap, inferOpponents, knockWinProbability, stockDrawEv, unseenPool } from './evaluate';
import { chooseSafeDiscard, isDiscardPhase, turnMoves, type BotParams } from './shared';

const MC_SAMPLES = 96;
const CHASE_BAR = Number(process.env.CHASE ?? 0.08);
const BLITZ_EQUITY = 12;

/**
 * Tier 3 "Hard" (spec §9): full open-information inference — expected-value
 * draw choices, Monte-Carlo knock timing, early-knock pressure against
 * suit-hungry opponents, and blitz-chasing when one card away from 31.
 */
export function makeHardBot(params: BotParams, id = 'hard', label = 'Hard'): BotPolicy<BlitzState> {
  return {
    id,
    label,
    tier: 3,
    chooseMove(view: BlitzState, seat: SeatId, legal: readonly LegalMove[], rng: Rng) {
      if (isDiscardPhase(legal)) {
        return chooseSafeDiscard(view, seat, legal, { memory: params.memory, feedJunk: true });
      }

      const { knock, stock, discardTop } = turnMoves(legal);
      const hand = view.hands[seat] ?? [];
      const value = handValue(hand, view.rules);

      // expected one-draw gain feeds both the knock bar and the draw choice
      const drawnEv = stockDrawEv(view, seat);
      if (knock && shouldKnock(view, seat, value, params, rng)) return knock;

      // final-turn desperation: facing a standing knock, the blitz lottery is
      // worth more than marginal swaps — keep drawing unless the top wins now
      if (view.knocker !== null && view.knocker !== seat && stock && discardTop) {
        const desperate =
          handValue(hand, view.rules) < Number(process.env.DESP_VALUE ?? 29) &&
          blitzChanceNextDraw(view, seat) >= 0.04;
        if (desperate) {
          const topNow = view.discard[0]!;
          const rescue = bestSwap(hand, topNow, view.rules);
          return rescue.gain >= Number(process.env.DESP_RESCUE ?? 3) ? discardTop : stock;
        }
      }

      if (discardTop && stock) {
        const top = view.discard[0]!;
        const swap = bestSwap(hand, top, view.rules);
        // the stock carries blitz equity: a chance at an instant win counts
        // toward drawing on even when the average swap gain looks worse
        const stockEv = drawnEv.ev + blitzChanceNextDraw(view, seat) * BLITZ_EQUITY;
        // denial pressure counts toward an already worthwhile take but never
        // justifies one on its own — that way lies infinite deny-cycles
        const score = swap.gain + denialBonus(view, top);
        if (swap.gain > 0 && score >= Math.min(stockEv, swap.gain + 2)) return discardTop;

        // urgent denial: a suit-hungry opponent nearing knock range loses more
        // from losing this card than we pay for holding it
        if (swap.gain >= -1 && opponentNearKnock(view, seat, top)) return discardTop;
      }

      return stock ?? knock ?? null;
    },
  };
}

function shouldKnock(
  view: BlitzState,
  seat: SeatId,
  value: number,
  params: BotParams,
  rng: Rng,
): boolean {
  const winProb = knockWinProbability(
    view,
    seat,
    value,
    {
      samples: MC_SAMPLES,
      finalTurnDraw: true,
      opponentUplift: params.opponentUplift,
      curationBias: params.curationBias,
      discardTop: view.discard[0],
    },
    rng,
  );

  // past 28 the hand speaks for itself — never let model doubt stall the round
  if (value >= 29) return true;

  // blitz-chase vs safe-knock tradeoff (spec §9): holding a real shot at an
  // instant 31 on the next draw beats banking a merely-good knock — but only
  // while the hand is still worth chasing; late hands must close the round
  if (params.chaseBlitz && value >= 20 && value <= 26) {
    const pBlitz = blitzChanceNextDraw(view, seat);
    if (pBlitz >= CHASE_BAR) return false;
  }

  return winProb >= (params.knockProb ?? 0.75);
}

/**
 * true when some opponent is publicly close enough to knocking that denying
 * the top card matters more than our own marginal improvement
 */
function opponentNearKnock(view: BlitzState, seat: SeatId, top: string): boolean {
  for (const insight of inferOpponents(view, seat)) {
    const appetite = insight.weights.get(suitOf(top)) ?? 0;
    if (appetite < 12) continue;
    const held = (view.hands[insight.seat] ?? []).length;
    const knownStrength =
      [...new Set(view.pickups.filter((p) => p.seat === insight.seat).map((p) => p.card))].length *
        2 +
      pipValue(insight.latest ?? 'C2');
    return held >= 1 && knownStrength >= 14;
  }
  return false;
}

/** chance that one stock draw completes an exactly-31 hand */
function blitzChanceNextDraw(view: BlitzState, seat: SeatId): number {
  const hand = view.hands[seat] ?? [];
  const pool = unseenPool(view, seat);
  if (pool.length === 0) return 0;
  let hits = 0;
  for (const card of pool) {
    const swap = bestSwap(hand, card, view.rules);
    if (swap.outgoing === null) continue;
    const rest = hand.filter((c) => c !== swap.outgoing);
    if (handValue([...rest, card], view.rules) === 31) hits += 1;
  }
  return hits / pool.length;
}

/** extra credit for taking the top card away from suit-hungry opponents */
function denialBonus(view: BlitzState, top: string): number {
  const suit = suitOf(top);
  const pips = pipValue(top);
  let bonus = 0;
  for (const insight of inferOpponents(view, null)) {
    bonus += ((insight.weights.get(suit) ?? 0) / 10) * pips * 0.25;
  }
  return bonus;
}
