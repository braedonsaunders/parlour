import type { BotPolicy, CardId, LegalMove, SeatId } from '@parlour/engine';
import {
  DRAW_TWO_RANK,
  EIGHTS_SUITS,
  REVERSE_RANK,
  SKIP_RANK,
  cardValue,
  isWild,
  rankOf,
  suitOf,
  type EightsSuit,
} from './cards';
import type { EightsState } from './state';

function payloadCard(move: LegalMove): CardId | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadSuit(move: LegalMove): EightsSuit | null {
  const suit = (move.payload as { suit?: unknown } | undefined)?.suit;
  return EIGHTS_SUITS.includes(suit as EightsSuit) ? (suit as EightsSuit) : null;
}

function ownHand(view: EightsState, seat: SeatId): readonly CardId[] {
  return view.round.hands[seat] ?? [];
}

/** The suit a bot is longest in, ignoring the eights that fit anywhere. */
function preferredSuit(view: EightsState, seat: SeatId): EightsSuit {
  const counts = new Map<EightsSuit, number>(EIGHTS_SUITS.map((suit) => [suit, 0]));
  for (const card of ownHand(view, seat)) {
    if (isWild(card)) continue;
    const suit = suitOf(card);
    counts.set(suit, (counts.get(suit) ?? 0) + 1);
  }
  return EIGHTS_SUITS.reduce((best, suit) =>
    (counts.get(suit) ?? 0) > (counts.get(best) ?? 0) ? suit : best,
  );
}

function suitLength(view: EightsState, seat: SeatId, suit: EightsSuit): number {
  return ownHand(view, seat).filter((card) => !isWild(card) && suitOf(card) === suit).length;
}

/** The smallest hand anyone else is showing — redaction leaves counts readable. */
function closestRival(view: EightsState, seat: SeatId): number {
  let fewest = Number.POSITIVE_INFINITY;
  view.round.hands.forEach((cards, index) => {
    if (index !== seat) fewest = Math.min(fewest, cards.length);
  });
  return Number.isFinite(fewest) ? fewest : 0;
}

function firstOf(legal: readonly LegalMove[], ...ids: readonly string[]): LegalMove | null {
  for (const id of ids) {
    const move = legal.find((candidate) => candidate.id === id);
    if (move) return move;
  }
  return null;
}

const easyBot: BotPolicy<EightsState> = {
  id: 'eights-easy',
  label: 'Easy Eights Bot',
  tier: 1,
  chooseMove(_view, _seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;
    const suits = legal.filter((move) => move.id === 'chooseSuit');
    if (suits.length > 0) return suits[rng.int(suits.length)] ?? null;
    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length > 0) return plays[rng.int(plays.length)] ?? null;
    return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;
  },
};

/**
 * The house bot plays the way most people do: shed the expensive cards, stay in
 * the suit you hold most of, and keep the eight in reserve until it is the only
 * card that goes on the pile.
 */
const houseBot: BotPolicy<EightsState> = {
  id: 'eights-house',
  label: 'House Bot',
  tier: 2,
  chooseMove(view, seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;

    const suitMove = legal.find(
      (move) => move.id === 'chooseSuit' && payloadSuit(move) === preferredSuit(view, seat),
    );
    if (suitMove) return suitMove;

    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length > 0) {
      const plain = plays.filter((move) => {
        const card = payloadCard(move);
        return card !== null && !isWild(card);
      });
      const pool = plain.length > 0 ? plain : plays;
      // Ties broken by the rng so two identical seats do not play in lockstep.
      return bestBy(pool, rng, (move) => {
        const card = payloadCard(move);
        if (!card) return -1;
        return cardValue(card) * 4 + suitLength(view, seat, suitOf(card)) * 3;
      });
    }
    return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;
  },
};

/**
 * The hard bot adds pressure: when somebody is one or two cards from out, a two
 * or a queen is worth more than dumping a king, and an eight stops being
 * precious the moment it wins the round outright.
 */
const hardBot: BotPolicy<EightsState> = {
  id: 'eights-hard',
  label: 'Hard Eights Bot',
  tier: 3,
  chooseMove(view, seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;

    const suitMove = legal.find(
      (move) => move.id === 'chooseSuit' && payloadSuit(move) === preferredSuit(view, seat),
    );
    if (suitMove) return suitMove;

    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length === 0) return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;

    const hand = ownHand(view, seat);
    const pressure = closestRival(view, seat) <= 2;
    const { rules } = view;

    return bestBy(plays, rng, (move) => {
      const card = payloadCard(move);
      if (!card) return -1;
      // Anything that empties the hand ends the round in this bot's favour.
      if (hand.length === 1) return 10_000;
      if (isWild(card)) return 0;

      const rank = rankOf(card);
      const action =
        (rank === DRAW_TWO_RANK && rules.twosDrawTwo) ||
        (rank === SKIP_RANK && rules.queensSkip) ||
        (rank === REVERSE_RANK && rules.acesReverse)
          ? pressure
            ? 90
            : 12
          : 0;
      return 40 + cardValue(card) * 4 + suitLength(view, seat, suitOf(card)) * 6 + action;
    });
  },
};

function bestBy(
  moves: readonly LegalMove[],
  rng: { int(maxExclusive: number): number },
  score: (move: LegalMove) => number,
): LegalMove | null {
  if (moves.length === 0) return null;
  let best: LegalMove[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const value = score(move);
    if (value > bestScore) {
      bestScore = value;
      best = [move];
    } else if (value === bestScore) {
      best.push(move);
    }
  }
  return best[rng.int(best.length)] ?? best[0] ?? null;
}

export const EIGHTS_BOTS: readonly BotPolicy<EightsState>[] = [easyBot, houseBot, hardBot];

export function eightsTierBot(tier: 1 | 2 | 3): BotPolicy<EightsState> {
  return EIGHTS_BOTS[tier - 1] ?? houseBot;
}
