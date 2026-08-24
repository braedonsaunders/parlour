import {
  type BotPolicy,
  type LegalMove,
  type PersonaMeta,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import { TWO_ORDER, tryOrder } from './deck';
import { activeSeats, giftCountFor, handOf, phaseFor, roleFor } from './game';
import type { PresidentState } from './state';

/**
 * President bots read one redacted view and the enumerated legal list — the
 * exact inputs a human client sees. Heuristics: set preservation, 2 management,
 * exchange strategy, endgame racing.
 */

interface Candidate {
  move: LegalMove;
  cards: readonly string[];
  rank: number;
  size: number;
}

function setCandidates(legal: readonly LegalMove[]): Candidate[] {
  const out: Candidate[] = [];
  for (const move of legal) {
    if (move.id !== 'playSet') continue;
    const raw = (move.payload as { cards?: unknown }).cards;
    if (!Array.isArray(raw)) continue;
    const cards = raw.filter((card): card is string => typeof card === 'string');
    const rank = tryOrder(cards[0] ?? '');
    if (rank === null || cards.length === 0) continue;
    out.push({ move, cards, rank, size: cards.length });
  }
  return out;
}

function groupCounts(cards: readonly string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const rank = tryOrder(card);
    if (rank === null) continue;
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

/** Playing part of a stronger held set wastes strength — charge for it. */
function breakPenalty(counts: Map<number, number>, rank: number, size: number): number {
  const held = counts.get(rank) ?? 0;
  const excess = held - size;
  return excess > 0 ? excess * excess : 0;
}

function rivalsMinHand(state: PresidentState, seat: SeatId): number {
  const rivals = activeSeats(state).filter((other) => other !== seat);
  if (rivals.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...rivals.map((other) => handOf(state, other).length));
}

function sortedByStrength(hand: readonly string[]): string[] {
  return [...hand]
    .filter((card) => tryOrder(card) !== null)
    .sort((a, b) => (tryOrder(b) ?? 0) - (tryOrder(a) ?? 0) || a.localeCompare(b));
}

function exchangePayload(
  state: PresidentState,
  seat: SeatId,
  want: 'best' | 'worst',
  keepTwos: boolean,
  rng: Rng,
): LegalMove | null {
  const order = state.lastOrder ?? [];
  if (!order.includes(seat)) return null;
  const returning = state.awaitingReturn?.seat === seat;
  const expected = state.awaitingReturn?.count;
  const count =
    returning && typeof expected === 'number'
      ? expected
      : giftCountFor(roleFor(order, seat) ?? 'neutral');
  const hand = handOf(state, seat);
  let pool = want === 'best' ? sortedByStrength(hand) : [...sortedByStrength(hand)].reverse();
  if (keepTwos && want === 'worst') {
    const spare = pool.filter((card) => tryOrder(card) !== TWO_ORDER);
    const twos = pool.filter((card) => tryOrder(card) === TWO_ORDER);
    if (spare.length >= count) pool = [...spare, ...twos];
  }
  const opaque = hand.filter((card) => tryOrder(card) === null);
  const chosen = pool.slice(0, count);
  while (chosen.length < count && opaque.length > 0) chosen.push(opaque.shift()!);
  while (chosen.length < count) {
    const filler = hand.find((card) => !chosen.includes(card));
    if (!filler) break;
    chosen.push(filler);
  }
  void rng;
  return {
    id: returning ? 'returnCards' : 'giveCards',
    payload: { cards: chosen },
  };
}

function passMove(legal: readonly LegalMove[]): LegalMove | null {
  return legal.find((move) => move.id === 'pass') ?? null;
}

// ---------------------------------------------------------------------------
// Tier 1 — Rookie: myopic, plays the lowest thing available
// ---------------------------------------------------------------------------

const rookiePersona: PersonaMeta = {
  name: 'Marigold',
  avatar: 'marigold',
  blurb: 'Plays whatever the moment hands her and loves a loud table.',
};

export const easyPresidentBot: BotPolicy<PresidentState> = {
  id: 'president-easy',
  label: 'Rookie',
  tier: 1,
  persona: rookiePersona,
  chooseMove(view, seat, legal, rng) {
    switch (phaseFor(view).phase) {
      case 'exchange-give':
        return exchangePayload(view, seat, 'best', false, rng);
      case 'exchange-return':
        return exchangePayload(view, seat, 'worst', false, rng);
      default:
        break;
    }
    const sets = setCandidates(legal);
    if (sets.length === 0) return passMove(legal);
    sets.sort((a, b) => a.rank - b.rank || a.size - b.size);
    if (rng.float() < 0.85) return sets[0]!.move;
    return (rng.pick(sets) ?? sets[0]!).move;
  },
};

// ---------------------------------------------------------------------------
// Tier 2 — Regular: preserves sets, manages 2s, dumps junk in exchanges
// ---------------------------------------------------------------------------

const regularPersona: PersonaMeta = {
  name: 'Slate',
  avatar: 'slate',
  blurb: 'Counts the table, keeps his pairs intact, never panics.',
};

interface ScoreWeights {
  rankWeight: number;
  breakWeight: number;
  twoCost: number;
}

function candidateScore(
  candidate: Candidate,
  counts: Map<number, number>,
  weights: ScoreWeights,
): number {
  // Cheapest play wins: high ranks cost more to spend now, breaking a stronger
  // held set hurts, whole groups shed faster than nibbles.
  let score = candidate.rank * weights.rankWeight;
  score += breakPenalty(counts, candidate.rank, candidate.size) * weights.breakWeight;
  if (candidate.rank === TWO_ORDER) score += weights.twoCost;
  score -= candidate.size * 1.5;
  return score;
}

function chooseScored(
  view: PresidentState,
  seat: SeatId,
  legal: readonly LegalMove[],
  weights: ScoreWeights,
  passThreshold: number | null,
): LegalMove | null {
  const sets = setCandidates(legal);
  if (sets.length === 0) return passMove(legal);
  const counts = groupCounts(handOf(view, seat));
  const scored = sets.map((candidate) => ({
    candidate,
    score: candidateScore(candidate, counts, weights),
  }));
  scored.sort((a, b) => a.score - b.score || a.candidate.rank - b.candidate.rank);
  const cheapest = scored[0]!;
  if (passThreshold !== null && cheapest.score > passThreshold) {
    const pass = passMove(legal);
    if (pass) return pass;
  }
  return cheapest.candidate.move;
}

export const mediumPresidentBot: BotPolicy<PresidentState> = {
  id: 'president-medium',
  label: 'Regular',
  tier: 2,
  persona: regularPersona,
  chooseMove(view, seat, legal, rng) {
    switch (phaseFor(view).phase) {
      case 'exchange-give':
        return exchangePayload(view, seat, 'best', false, rng);
      case 'exchange-return':
        return exchangePayload(view, seat, 'worst', true, rng);
      default:
        break;
    }
    const racing = handOf(view, seat).length <= 3;
    const weights: ScoreWeights = racing
      ? { rankWeight: 3, breakWeight: 1, twoCost: 8 }
      : { rankWeight: 2, breakWeight: 6, twoCost: 26 };
    const threshold = racing ? null : 34;
    return chooseScored(view, seat, legal, weights, threshold);
  },
};

// ---------------------------------------------------------------------------
// Tier 3 — Sharp: endgame racing, defensive passes, exchange judgement
// ---------------------------------------------------------------------------

const sharpPersona: PersonaMeta = {
  name: 'Juniper',
  avatar: 'juniper',
  blurb: 'Cold math, warm smile, and a 2 saved for exactly the right beat.',
};

export const hardPresidentBot: BotPolicy<PresidentState> = {
  id: 'president-hard',
  label: 'Sharp',
  tier: 3,
  persona: sharpPersona,
  chooseMove(view, seat, legal, rng) {
    switch (phaseFor(view).phase) {
      case 'exchange-give':
        return exchangePayload(view, seat, 'best', true, rng);
      case 'exchange-return':
        return exchangePayload(view, seat, 'worst', true, rng);
      default:
        break;
    }
    const handSize = handOf(view, seat).length;
    const rivalMin = rivalsMinHand(view, seat);
    const racing = handSize <= Math.max(3, rivalMin);

    const sets = setCandidates(legal);
    if (sets.length === 0) return passMove(legal);
    const counts = groupCounts(handOf(view, seat));

    const scored = sets.map((candidate) => {
      let score = candidateScore(
        candidate,
        counts,
        racing
          ? { rankWeight: 4, breakWeight: 0.5, twoCost: 6 }
          : { rankWeight: 2.5, breakWeight: 7, twoCost: 30 },
      );
      if (candidate.size === handSize) score -= 500; // going out this beat wins the deal
      if (!racing && rivalMin <= 2 && candidate.rank >= TWO_ORDER - 3) {
        score += 10; // shed power while the race is on
      }
      return { candidate, score };
    });
    scored.sort((a, b) => a.score - b.score || a.candidate.rank - b.candidate.rank);
    const cheapest = scored[0]!;

    if (view.standing && !racing) {
      const holdThreshold = rivalMin <= 1 ? 60 : 38;
      if (cheapest.score > holdThreshold) {
        const pass = passMove(legal);
        if (pass) return pass;
      }
    }
    return cheapest.candidate.move;
  },
};

export const presidentBots: readonly BotPolicy<PresidentState>[] = [
  easyPresidentBot,
  mediumPresidentBot,
  hardPresidentBot,
];
