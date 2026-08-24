import type { CardId, LegalMove, Rng, SeatId } from '@parlour/engine';
import { QUEEN_SPADES, isHeart, suitOfCard } from '../cards';
import { knownVoids, readTrick, passDanger, queenStillOut, voidBonus } from './evaluate';
import type { HeartsState } from '../state';

/**
 * Card-choice heuristics shared by the medium and hard policies. Everything
 * reads the caller's own view — never another seat's hidden hand.
 */

export function legalPlayCards(legal: readonly LegalMove[]): CardId[] {
  return legal.flatMap((move) =>
    move.id === 'playCard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

export function choosePassCards(
  state: HeartsState,
  seat: SeatId,
  size: number,
  rng: Rng,
  tier: 1 | 2 | 3,
): CardId[] {
  const hand = [...(state.hands[seat] ?? [])];
  if (hand.length <= size) return hand;
  if (tier === 1) {
    // Harmless passes whatever looks least scary — which means clinging to
    // exactly the cards that hurt later.
    const keeps = hand.filter(
      (card) => card === QUEEN_SPADES || (suitOfCard(card) === 'spades' && rankOf(card) >= 13),
    );
    const rest = rng.shuffle(hand.filter((card) => !keeps.includes(card)));
    return [...rest, ...rng.shuffle(keeps)].slice(0, size);
  }
  const scored = hand
    .map((card) => ({
      card,
      score: passDanger(card, state.rules) + (tier >= 3 ? voidBonus(hand, card) : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, size).map((entry) => entry.card);
}

/** Highest card that stays under the current winner; null when everything wins. */
export function duckUnder(
  hand: readonly CardId[],
  ledSuit: string,
  winningRank: number,
): CardId | null {
  const followers = hand.filter((card) => suitOfCard(card) === ledSuit);
  const safe = followers.filter((card) => rankOf(card) < winningRank);
  if (safe.length === 0) return null;
  return safe.reduce((best, card) => (rankOf(card) > rankOf(best) ? card : best));
}

export function lowestOfSuit(hand: readonly CardId[], suit: string): CardId | null {
  const inSuit = hand.filter((card) => suitOfCard(card) === suit);
  if (inSuit.length === 0) return null;
  return inSuit.reduce((low, card) => (rankOf(card) < rankOf(low) ? card : low));
}

export function highestNonQueen(hand: readonly CardId[]): CardId {
  const candidates = hand.filter((card) => card !== QUEEN_SPADES);
  const pool = candidates.length > 0 ? candidates : hand;
  return pool.reduce((high, card) => (rankOf(card) > rankOf(high) ? card : high));
}

export function rankOf(card: CardId): number {
  const value = Number.parseInt(card.slice(1), 10);
  return Number.isFinite(value) ? value : -1;
}

/** Dump order when void: shed the queen, then bare high spades, then hearts. */
export function dumpOrder(hand: readonly CardId[], state: HeartsState): CardId[] {
  return [...hand].sort((a, b) => discardUrgency(b, state) - discardUrgency(a, state));
}

function discardUrgency(card: CardId, state: HeartsState): number {
  let urgency = rankOf(card);
  if (card === QUEEN_SPADES) urgency += 100;
  else if (suitOfCard(card) === 'spades' && rankOf(card) >= 13 && queenStillOut(state))
    urgency += 40;
  if (isHeart(card)) urgency += rankOf(card) * 2 + 8;
  if (state.rules.jackDiamonds && card === 'D11') urgency -= 50; // keep the bonus
  return urgency;
}

interface PlayContext {
  state: HeartsState;
  seat: SeatId;
  cards: CardId[];
  tier: 1 | 2 | 3;
  rng: Rng;
}

/** Shared decision ladder; tier gates which rungs exist. */
export function pickPlay({ state, seat, cards, tier, rng }: PlayContext): CardId | null {
  if (cards.length === 0) return null;
  const trick = state.trick;
  const ledSuit = trick?.ledSuit ?? null;

  // Tier 1 plays by vibes alone — including ugly leads.
  if (tier === 1) return rng.pick(cards);

  // Leading
  if (ledSuit === null || trick === null || trick.plays.length === 0) {
    return pickLead(state, seat, cards, tier);
  }

  const winning = readTrick(trick.plays, rankOf, state.rules.jackDiamonds);
  const following = cards.filter((card) => suitOfCard(card) === ledSuit);

  // Void — dump the ugliest card onto the table.
  if (following.length === 0) {
    const ordered = dumpOrder(cards, state);
    // Hard bots keep the −10 jack when a heart is already falling on someone.
    if (
      tier >= 3 &&
      state.rules.jackDiamonds &&
      winning.pointsOnTable > 0 &&
      cards.includes('D11') &&
      ordered[0] === 'D11'
    ) {
      return ordered[1] ?? 'D11';
    }
    return ordered[0]!;
  }

  // Must follow.
  const under = duckUnder(cards, ledSuit, winning.winningRank);
  if (under !== null) return under;

  // Forced to win anyway: take it as cheaply as possible and never volunteer
  // the queen — winning big here only collects the dumps that follow.
  const winners = following.filter((card) => rankOf(card) > winning.winningRank);
  const nonQueen = winners.filter((card) => card !== QUEEN_SPADES);
  const pool = nonQueen.length > 0 ? nonQueen : winners;
  return pool.reduce((low, card) => (rankOf(card) < rankOf(low) ? card : low));
}

function pickLead(state: HeartsState, seat: SeatId, cards: CardId[], tier: 1 | 2 | 3): CardId {
  const queenOut = queenStillOut(state);

  // Leading candidates: keep hearts off the table and never volunteer A♠/K♠
  // while the queen hides — holding them is risk enough.
  let pool = cards.filter((card) => {
    if (isHeart(card)) return false;
    if (suitOfCard(card) === 'spades' && queenOut && rankOf(card) >= 12) return false;
    return true;
  });
  if (pool.length === 0) pool = cards.filter((card) => !isHeart(card));
  if (pool.length === 0) pool = cards;

  // Prefer leading from length: more cards behind it, fewer endgame winners.
  let pool2 = pool as CardId[];
  if (tier >= 3) {
    // Sharp bots remember who is void: leading into two known voids invites
    // a dumped queen, so weigh every candidate by that risk first.
    const voids = knownVoids(state.plays, state.seats);
    const riskOf = (card: CardId): number => {
      const suit = suitOfCard(card);
      if (!suit) return 0;
      let risk = 0;
      for (let other = 0; other < state.seats; other++) {
        if (other === seat) continue;
        if (voids.has(`${other}:${suit}`)) risk += 1;
      }
      return risk;
    };
    const safest = [...pool].sort((a, b) => riskOf(a) - riskOf(b));
    const bestRisk = safest.length > 0 ? riskOf(safest[0]!) : 0;
    if (bestRisk >= 2) {
      pool2 = pool.filter((card) => riskOf(card) === bestRisk);
    } else {
      pool2 = pool.filter((card) => riskOf(card) <= 1);
      if (pool2.length === 0) pool2 = [...pool];
    }
  }
  const ranked = [...pool2].sort((a, b) => {
    const rankDiff = rankOf(a) - rankOf(b);
    if (rankDiff !== 0) return rankDiff;
    return suitLength(cards, b) - suitLength(cards, a);
  });
  return ranked[0]!;
}

function suitLength(hand: readonly CardId[], card: CardId): number {
  const suit = suitOfCard(card);
  if (!suit) return 0;
  return hand.filter((other) => suitOfCard(other) === suit).length;
}

export function allHeartsHand(cards: readonly CardId[]): boolean {
  return cards.length > 0 && cards.every(isHeart);
}

export function pointsTakenBy(state: HeartsState, seat: SeatId): number {
  const pile = state.taken[seat] ?? [];
  return pile.reduce((sum, card) => sum + cardWorth(card), 0);
}

export function totalPointsTaken(state: HeartsState): number {
  return state.taken.reduce(
    (sum, pile) => sum + pile.reduce((acc, card) => acc + cardWorth(card), 0),
    0,
  );
}

function cardWorth(card: CardId): number {
  if (isHeart(card)) return 1;
  if (card === QUEEN_SPADES) return 13;
  return 0;
}
