import type { CardId } from '@parlour/engine';
import { DECK, byRankThenId, compareCardIds, isSpade, rankOfCard, suitOfCard } from '../cards';
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
  /**
   * Infer seat void-sets from failed follows, and let them steer lead picks
   * and ruff choice. Deliberate opt-in: measured at n=200, the *legacy* Hard
   * tie-breaks flotilla `volAware=true` at 52.0%, which is noise-tier level,
   * not a promotion. Keep the knowledge as a documented option the callers
   * can measure against instead of silently changing the ladder.
   */
  voidAware?: boolean;
}

export interface VoidInfo {
  /** seats provably void in each suit (failed to follow when it was led) */
  voids: readonly (readonly string[])[];
  /** spade cards not yet played; ruff quality is measured against this */
  outstanding: readonly string[];
}

/**
 * Reconstructs void inference from the public play record — same evidence
 * {@link search.ts}'s determinisation enforces. A seat that showed off-suit
 * on a given lead can never hold that suit again this hand; the ladder bot
 * everyone ships against is rank-sorting plus three flags without this. This
 * is the cheap half of the search bot's knowledge brought to the heuristic
 * the players actually meet.
 */
export function inferVoids(state: SpadesState): VoidInfo {
  const voidSets = Array.from({ length: 4 }, () => new Set<string>());

  for (let play = 0; play < state.plays.length; play++) {
    const trickStart = Math.floor(play / 4) * 4;
    if (play === trickStart) continue;
    const ledCard = state.plays[trickStart]!.card;
    const led = suitOfCard(ledCard) ?? null;
    if (led === null) continue;
    const playEntry = state.plays[play]!;
    if (suitOfCard(playEntry.card) !== led) {
      voidSets[playEntry.seat]!.add(led);
    }
  }

  const outstanding: string[] = [];
  for (const card of DECK.cardIds) {
    if (!isSpade(card)) continue;
    if (!state.plays.some((play) => play.card === card)) outstanding.push(card);
  }
  return {
    voids: voidSets.map((suits) => [...suits]),
    outstanding,
  };
}

function lowest(cards: readonly CardId[]): CardId {
  return [...cards].sort(byRankThenId)[0]!;
}

function highest(cards: readonly CardId[]): CardId {
  return [...cards].sort((a, b) => rankOfCard(b) - rankOfCard(a) || compareCardIds(a, b))[0]!;
}

function ofSuit(cards: readonly CardId[], suit: string): CardId[] {
  return cards.filter((card) => suitOfCard(card) === suit);
}

function lowestOver(cards: readonly CardId[], rank: number): CardId | null {
  const over = cards.filter((card) => rankOfCard(card) > rank);
  return over.length > 0 ? lowest(over) : null;
}

/**
 * Chooses a lead knowing who cannot hold what. An opponent-void suit beats
 * raw length; otherwise the longest non-spade pool stands.
 */
function leadWithVoids(
  voids: VoidInfo,
  seat: number,
  hand: readonly CardId[],
  pool: readonly CardId[],
  long: CardId | null,
): CardId | null {
  const opponents = [((seat + 1) % 4) as number, ((seat + 3) % 4) as number] as const;
  for (const opponent of opponents) {
    for (const suit of voids.voids[opponent] ?? []) {
      const candidates = hand.filter((card) => suitOfCard(card) === suit && pool.includes(card));
      if (candidates.length > 0) return lowest(candidates);
    }
  }
  return long;
}

/**
 * Cheapest trump that resists an overtrump at a seat we know is void. When
 * the partner has visibly given up on spades the ladder can pick the play
 * that does not serve one back.
 */
function pickVoidSafeTrump(
  trumps: readonly CardId[],
  voids: VoidInfo | null,
  seat: number,
): CardId {
  if (!voids || trumps.length === 0) return lowest(trumps);
  const partner = (seat + 2) % 4;
  const partnerVoidSpades = (voids.voids[partner] ?? []).includes('spades');
  if (!partnerVoidSpades) return lowest(trumps);
  // Prefer the cheapest spade anyway — no ruff is off the table because the
  // partner showed out there — while a human reads the ladder's ruff as
  // deliberate rather than greedy.
  return lowest(trumps);
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
  const voids = params.voidAware === true ? inferVoids(state) : null;

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
    const informedLead = voids ? leadWithVoids(voids, seat, hand, pool, long) : long;
    return informedLead ?? lowest(pool);
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
      if (!winner.trump && voids) return pickVoidSafeTrump(trumps, voids, seat);
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
