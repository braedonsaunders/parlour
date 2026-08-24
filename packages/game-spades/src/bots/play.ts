import type { CardId } from '@parlour/engine';
import { isSpade, rankOfCard, suitOfCard } from '../cards';
import { currentWinner, ownHand, partnerIsWinning } from './evaluate';
import type { SpadesState } from '../state';

export interface PlayParams {
  /** try to duck under a winning partner */
  coverPartner: boolean;
  /** ruff when void if the opponent is winning */
  eagerRuff: boolean;
  /** avoid taking extra books when bags are high and the team is ahead */
  bagAvoid: boolean;
  /** dump winners if this seat bid nil */
  protectNil: boolean;
}

function lowest(cards: readonly CardId[]): CardId {
  return [...cards].sort((a, b) => rankOfCard(a) - rankOfCard(b) || a.localeCompare(b))[0]!;
}

function highest(cards: readonly CardId[]): CardId {
  return [...cards].sort((a, b) => rankOfCard(b) - rankOfCard(a) || a.localeCompare(b))[0]!;
}

function ofSuit(cards: readonly CardId[], suit: string): CardId[] {
  return cards.filter((card) => suitOfCard(card) === suit);
}

function lowestOver(cards: readonly CardId[], rank: number): CardId | null {
  const over = cards.filter((card) => rankOfCard(card) > rank);
  return over.length > 0 ? lowest(over) : null;
}

export function decidePlay(
  state: SpadesState,
  seat: number,
  legal: readonly CardId[],
  params: PlayParams,
): CardId {
  if (legal.length === 1) return legal[0]!;
  const bid = state.bids[seat];
  const selfNil = bid?.nil === true;
  const partnerNil = state.bids[(seat + 2) % 4]?.nil === true;
  const winner = currentWinner(state);
  const team = seat % 2;
  const bags = state.bags[team] ?? 0;
  const ahead = (state.scores[team] ?? 0) > (state.scores[team === 0 ? 1 : 0] ?? 0);
  const avoidBags = params.bagAvoid && state.rules.bags && bags >= 7 && ahead;

  if (selfNil && params.protectNil) {
    if (winner && !partnerIsWinning(state, seat)) {
      const under = legal.filter((card) => {
        if (winner.trump && !isSpade(card)) return true;
        if (!winner.trump && isSpade(card)) return false;
        return rankOfCard(card) < winner.rank;
      });
      if (under.length > 0) return highest(under);
    }
    return lowest(legal);
  }

  if (state.trick === null || state.trick.plays.length === 0) {
    const nonSpades = legal.filter((card) => !isSpade(card));
    const pool = nonSpades.length > 0 ? nonSpades : legal;
    if (partnerNil) return highest(pool);
    if (avoidBags) return lowest(pool);
    const hand = ownHand(state, seat);
    const long = longestSuitLead(pool, hand);
    return long ?? lowest(pool);
  }

  const led = state.trick.ledSuit;
  const followers = led ? ofSuit(legal, led) : [];
  const inSuit = followers.length > 0 ? followers : legal;

  if (partnerIsWinning(state, seat) && params.coverPartner && !partnerNil) {
    return lowest(inSuit);
  }

  if (winner && !partnerIsWinning(state, seat)) {
    if (followers.length > 0) {
      const over = winner.trump ? null : lowestOver(followers, winner.rank);
      if (over && !avoidBags) return over;
      return lowest(followers);
    }
    const trumps = legal.filter(isSpade);
    if (trumps.length > 0 && params.eagerRuff && !avoidBags) {
      if (!winner.trump) return lowest(trumps);
      const over = lowestOver(trumps, winner.rank);
      if (over) return over;
    }
    return lowest(legal);
  }

  if (partnerNil) {
    return highest(inSuit);
  }

  return avoidBags ? lowest(legal) : lowest(inSuit);
}

function longestSuitLead(legal: readonly CardId[], hand: readonly CardId[]): CardId | null {
  const counts = new Map<string, number>();
  for (const card of hand) {
    const suit = suitOfCard(card);
    if (suit && suit !== 'spades') counts.set(suit, (counts.get(suit) ?? 0) + 1);
  }
  let bestSuit: string | null = null;
  let bestCount = -1;
  for (const [suit, count] of counts) {
    if (count > bestCount && legal.some((card) => suitOfCard(card) === suit)) {
      bestSuit = suit;
      bestCount = count;
    }
  }
  if (!bestSuit) return null;
  const inSuit = legal.filter((card) => suitOfCard(card) === bestSuit);
  return inSuit.length > 0 ? lowest(inSuit) : null;
}
