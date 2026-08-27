import type { CardId, Rng, SeatId } from '@parlour/engine';
import { playToTrick, resolveTrickWinner, type Trick } from '@parlour/tricks';
import { pinochleTrickRules, suitOfCard, teamOf, type PinochleSuit } from '../cards';
import type { PinochleState } from '../state';
import { strongestCard, weakestCard } from './evaluate';

export interface PlayParams {
  /** how eagerly a bot leads trump instead of a side suit */
  leadTrumpAggression: number;
  /** how eagerly a bot ducks a low card when its partner is already winning */
  duckToPartner: number;
}

function currentWinner(state: PinochleState, trump: PinochleSuit): SeatId | null {
  if (!state.trick || state.trick.plays.length === 0) return null;
  return resolveTrickWinner(state.trick, pinochleTrickRules(trump));
}

/** Picks one card to play from the legal set: lead strong, duck to a winning partner, else win cheaply. */
export function decidePlay(
  state: PinochleState,
  seat: SeatId,
  legal: readonly CardId[],
  params: PlayParams,
  rng: Rng,
): CardId {
  if (legal.length === 1) return legal[0]!;
  const trump = state.trump as PinochleSuit;
  const leading = !state.trick || state.trick.plays.length === 0;

  if (leading) {
    const nonTrump = legal.filter((card) => suitOfCard(card) !== trump);
    if (nonTrump.length > 0 && rng.float() > params.leadTrumpAggression) {
      return strongestCard(nonTrump);
    }
    return strongestCard(legal);
  }

  const winner = currentWinner(state, trump);
  const partnerWinning = winner !== null && teamOf(winner) === teamOf(seat);
  if (partnerWinning && rng.float() < params.duckToPartner) {
    return weakestCard(legal);
  }

  const rules = pinochleTrickRules(trump);
  const trick = state.trick as Trick;
  const winningCards = legal.filter(
    (card) => resolveTrickWinner(playToTrick(trick, seat, card, rules), rules) === seat,
  );
  if (winningCards.length > 0) return weakestCard(winningCards);
  return weakestCard(legal);
}
