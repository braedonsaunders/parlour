import { stdDeck, type CardId, type SeatId } from '@parlour/engine';
import { handValue, pipValue, suitOf } from '../hand';
import type { BlitzState } from '../state';

const ALL_CARDS = stdDeck().cardIds;

/** Open-information view helpers. Everything here reads ONLY the redacted view. */

export function knownCards(view: BlitzState, seat: SeatId): Set<CardId> {
  const seen = new Set<CardId>(view.discard);
  for (const card of view.hands[seat] ?? []) seen.add(card);
  return seen;
}

/** Cards this seat cannot place: everything outside its hand and the discard pile. */
export function unseenPool(view: BlitzState, seat: SeatId): CardId[] {
  const known = knownCards(view, seat);
  return ALL_CARDS.filter((card) => !known.has(card));
}

export interface Swap {
  gain: number;
  outgoing: CardId | null;
}

/** Best value delta from adding `incoming` and discarding one card. */
export function bestSwap(
  hand: readonly CardId[],
  incoming: CardId,
  rules: BlitzState['rules'],
): Swap {
  const base = handValue(hand, rules);
  let best: Swap = { gain: -Infinity, outgoing: null };
  for (let i = 0; i < hand.length; i++) {
    const rest = [...hand.slice(0, i), ...hand.slice(i + 1), incoming];
    const gain = handValue(rest, rules) - base;
    if (gain > best.gain) best = { gain, outgoing: hand[i] as CardId };
  }
  return best;
}

/** Value lost by removing `outgoing` from the hand (higher loss = safer kept). */
export function discardLoss(
  hand: readonly CardId[],
  outgoing: CardId,
  rules: BlitzState['rules'],
): number {
  const without = hand.filter((c) => c !== outgoing);
  return handValue(hand, rules) - handValue(without, rules);
}

/**
 * Expected one-draw improvement over the unseen pool — the open-information
 * estimate of what drawing from the stock is worth.
 */
export function stockDrawEv(view: BlitzState, seat: SeatId): { ev: number; pool: CardId[] } {
  const pool = unseenPool(view, seat);
  const hand = view.hands[seat] ?? [];
  if (pool.length === 0) return { ev: 0, pool };
  let total = 0;
  for (const card of pool) total += bestSwap(hand, card, view.rules).gain;
  return { ev: total / pool.length, pool };
}

export interface OpponentInsight {
  seat: SeatId;
  /** pip-weighted suit appetite inferred from their discard pickups */
  weights: Map<string, number>;
  /** most recently taken card per opponent — the strongest public signal */
  latest: CardId | null;
}

/**
 * Suit inference from the public pickups trail (spec §9 tier 2+). An
 * opponent's latest take counts double. Pass `excludeSeat = null` to read the
 * whole table.
 */
export function inferOpponents(view: BlitzState, excludeSeat: SeatId | null): OpponentInsight[] {
  const insights = new Map<SeatId, OpponentInsight>();
  for (let s = 0; s < view.seats; s++) {
    if (excludeSeat === null || s !== excludeSeat) {
      insights.set(s as SeatId, { seat: s as SeatId, weights: new Map(), latest: null });
    }
  }
  view.pickups.forEach((pickup, index) => {
    const target = insights.get(pickup.seat);
    if (!target) return;
    const recencyBonus = index === view.pickups.length - 1 ? 2 : 1;
    const weight = pipValue(pickup.card) * recencyBonus;
    const suit = suitOf(pickup.card);
    target.weights.set(suit, (target.weights.get(suit) ?? 0) + weight);
    target.latest = pickup.card;
  });
  return [...insights.values()];
}

/** How much discarding `card` feeds opponents' inferred suits. */
export function dangerScore(insights: readonly OpponentInsight[], card: CardId): number {
  let danger = 0;
  const suit = suitOf(card);
  for (const insight of insights) {
    danger += (insight.weights.get(suit) ?? 0) / 10;
  }
  return danger;
}

/**
 * Per-opponent public anchors: cards we SAW them take from the discard pile.
 * Recent takes stay likelier to still be held, so keep the newest few up to
 * their current hand size.
 */
export function opponentAnchors(
  view: BlitzState,
  excludeSeat: SeatId | null,
): Map<SeatId, CardId[]> {
  const anchors = new Map<SeatId, CardId[]>();
  for (let s = 0; s < view.seats; s++) {
    if (excludeSeat !== null && s === excludeSeat) continue;
    anchors.set(s as SeatId, []);
  }
  const seen = new Map<SeatId, Set<CardId>>();
  for (const pickup of view.pickups) {
    let taken = seen.get(pickup.seat);
    if (!taken) {
      taken = new Set<CardId>();
      seen.set(pickup.seat, taken);
    }
    // re-taking a card they previously held means the older copy left their hand
    const held = anchors.get(pickup.seat);
    if (held) {
      const at = held.indexOf(pickup.card);
      if (at >= 0) held.splice(at, 1);
    }
    taken.add(pickup.card);
    held?.push(pickup.card);
  }
  for (const [seatId, held] of anchors) {
    const size = Math.max(0, (view.hands[seatId] ?? []).length);
    anchors.set(seatId, held.slice(-size));
  }
  return anchors;
}

export interface KnockOdds {
  /** number of Monte-Carlo samples */
  samples: number;
  /**
   * model the opponents' mandatory final-turn draw after a knock: each sampled
   * hand also draws one more card and makes its best swap before comparing
   */
  finalTurnDraw?: boolean;
  /**
   * expected extra gain added to every sampled opponent hand on top of the
   * modeled draw — cheap knob for opponent competence
   */
  opponentUplift?: number;
  /** the discard top the prospective knocker leaves available to opponents */
  discardTop?: CardId;
  /** per-seat suit appetite (pip-weighted) used to weight hidden-card samples */
  appetiteBySeat?: Map<SeatId, Map<string, number>>;
  /**
   * assume opponents' hidden cards are curated toward strong suits rather than
   * uniformly random: fill cards are sampled with probability proportional to
   * pip value (0 = uniform random deal)
   */
  curationBias?: number;
}

/**
 * Monte-Carlo estimate that knocking now wins. Opponent hands are anchored on
 * their public pickups (open information), filled with optionally value-biased
 * samples from the unseen pool, and optionally given their final-turn draw;
 * every sampled hand landing at/above `myValue` counts as a loss.
 */
export function knockWinProbability(
  view: BlitzState,
  seat: SeatId,
  myValue: number,
  odds: KnockOdds,
  rng: { int(maxExclusive: number): number },
): number {
  const opponents = Array.from({ length: view.seats }, (_, i) => i as SeatId).filter(
    (s) => s !== seat,
  );
  if (opponents.length === 0) return myValue >= 31 ? 1 : 0;

  const anchorsByOpp = opponentAnchors(view, seat);
  let needed = 0;
  const fillSizes = new Map<SeatId, number>();
  for (const opp of opponents) {
    const size = (view.hands[opp] ?? []).length;
    const fill = Math.max(0, size - (anchorsByOpp.get(opp)?.length ?? 0));
    fillSizes.set(opp, fill);
    needed += fill;
  }
  const draws = odds.finalTurnDraw ? opponents.length : 0;

  const pool = unseenPool(view, seat).filter(
    (card) => ![...anchorsByOpp.values()].some((held) => held.includes(card)),
  );
  if (pool.length < needed + draws) return myValue >= 31 ? 1 : 0;

  const bias = odds.curationBias ?? 0;
  // opponents' hidden cards skew toward the suit they publicly collect and,
  // generically, toward higher pips — greedy play curates both ways
  const tastes = odds.appetiteBySeat ?? new Map();
  for (const insight of inferOpponents(view, seat)) {
    if (!tastes.has(insight.seat)) tastes.set(insight.seat, insight.weights);
  }

  const weightedDraw = (work: CardId[], opp: SeatId): CardId => {
    const suits = tastes.get(opp);
    const weights = work.map(
      (card) =>
        1 +
        bias * (pipValue(card) / 11) +
        1.6 * Math.min(1.5, (suits?.get(suitOf(card)) ?? 0) / 10),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.int(Math.max(1, Math.round(total * 100))) / 100;
    for (let i = 0; i < work.length; i++) {
      roll -= weights[i] as number;
      if (roll <= 0) return work.splice(i, 1)[0] as CardId;
    }
    return work.pop() as CardId;
  };

  const uplift = odds.opponentUplift ?? 0;
  let wins = 0;
  for (let k = 0; k < odds.samples; k++) {
    const work = pool.slice();
    let beaten = true;
    for (const opp of opponents) {
      const held = anchorsByOpp.get(opp) ?? [];
      const fill = fillSizes.get(opp) ?? 0;
      const drawn: CardId[] = [];
      for (let c = 0; c < fill; c++) drawn.push(weightedDraw(work, opp));
      const arr = [...held, ...drawn];
      let value = handValue(arr, view.rules);
      if (odds.finalTurnDraw) {
        // their mandatory draw is either the stock … or the top we left them
        let bestGain = 0;
        if (odds.discardTop !== undefined) {
          bestGain = Math.max(bestGain, bestSwap(arr, odds.discardTop, view.rules).gain);
        }
        if (work.length > 0) {
          const next = weightedDraw(work, opp);
          bestGain = Math.max(bestGain, Math.max(0, bestSwap(arr, next, view.rules).gain));
        }
        value += bestGain;
      }
      if (value + uplift >= myValue) {
        beaten = false;
        break;
      }
    }
    if (beaten) wins += 1;
  }
  return odds.samples > 0 ? wins / odds.samples : 0;
}
