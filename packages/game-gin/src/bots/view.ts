import type { CardId, SeatId } from '@parlour/engine';
import { pipValue, rankOf, suitOf } from '../cards';
import { bestPartition } from '../melds';
import { HAND_SIZE } from '../score';
import type { GinState } from '../state';
import type { BrainContext } from './params';

// ---------------------------------------------------------------------------
// What a bot may know, derived from its redacted view.
// ---------------------------------------------------------------------------

export function ownHand(ctx: BrainContext): readonly CardId[] {
  return ctx.view.hands[ctx.seat] ?? [];
}

export function opponentSeat(ctx: BrainContext): SeatId {
  return ctx.seat === 0 ? 1 : 0;
}

/** Cards this seat has not seen: the deck minus its hand minus the public pile. */
export function unseenPool(view: GinState, seat: SeatId): CardId[] {
  const seen = new Set<string>([...(view.hands[seat] ?? []), ...view.discard]);
  const pool: CardId[] = [];
  for (let suitIndex = 0; suitIndex < 4; suitIndex++) {
    for (let rank = 1; rank <= 13; rank++) {
      const id = cardId(suitIndex, rank);
      if (!seen.has(id)) pool.push(id);
    }
  }
  return pool;
}

function cardId(suitIndex: number, rank: number): CardId {
  return `${'SHDC'[suitIndex]}${rank}`;
}

/**
 * Opponent appetite per card inferred from their discard takes that have not
 * re-surfaced in the pile — scaled by the bot's memory knob.
 */
export function inferAppetite(ctx: BrainContext): Map<CardId, number> {
  const weights = new Map<CardId, number>();
  if (ctx.params.memory <= 0) return weights;

  const discarded = new Set<string>(ctx.view.discard);
  for (const pickup of ctx.view.pickups) {
    if (pickup.seat === ctx.seat) continue;
    if (discarded.has(pickup.card)) continue; // thrown back — told us nothing
    weightAround(weights, pickup.card, ctx.params.memory);
  }
  return weights;
}

function weightAround(weights: Map<CardId, number>, seed: CardId, amount: number): void {
  bump(weights, seed, amount * 2);
  const suit = suitOf(seed);
  const rank = rankOf(seed);
  for (const delta of [-2, -1, 1, 2]) {
    const near = rank + delta;
    if (near >= 1 && near <= 13) bump(weights, `${suit}${near}` as CardId, amount);
  }
  for (let suitIndex = 0; suitIndex < 4; suitIndex++) {
    bump(weights, cardId(suitIndex, rank), amount * 0.6);
  }
}

function bump(weights: Map<CardId, number>, card: CardId, by: number): void {
  weights.set(card, (weights.get(card) ?? 0) + by);
}

export interface DrawOption {
  take: 'stock' | 'discard';
  /** the card on top of the discard pile, when relevant */
  card: CardId | null;
  /** deadwood after drawing and throwing away the worst card */
  projected: number;
  gain: number;
}

export function bestThrow(
  hand: readonly CardId[],
  incoming: CardId,
): { deadwood: number; throw: CardId } {
  let best = { deadwood: Infinity, throw: incoming };
  const withIncoming = [...hand, incoming];
  for (const candidate of withIncoming) {
    const rest = withIncoming.filter((card) => card !== candidate);
    const deadwood = bestPartition(rest).deadwood;
    if (deadwood < best.deadwood) best = { deadwood, throw: candidate };
  }
  return best;
}

/** Deadwood now, plus what taking each source would project to. */
export function drawOptions(ctx: BrainContext): {
  current: number;
  stock: DrawOption;
  discard: DrawOption | null;
} {
  const hand = ownHand(ctx);
  const current = bestPartition(hand).deadwood;
  const upcard = ctx.view.discard[0] ?? null;
  const unseen = unseenPool(ctx.view, ctx.seat);

  const stock: DrawOption = {
    take: 'stock',
    card: null,
    projected: averageProjection(hand, unseen),
    gain: current - averageProjection(hand, unseen),
  };

  let discard: DrawOption | null = null;
  if (upcard !== null) {
    const after = bestThrow(hand, upcard);
    // throwing the taken card straight back means the take bought nothing
    const projected = after.throw === upcard ? current : after.deadwood;
    discard = { take: 'discard', card: upcard, projected, gain: current - projected };
  }

  return { current, stock, discard };
}

function averageProjection(hand: readonly CardId[], pool: readonly CardId[]): number {
  if (pool.length === 0) return bestPartition(hand).deadwood;
  let total = 0;
  for (const card of pool) total += bestThrow(hand, card).deadwood;
  return total / pool.length;
}

/**
 * Share of sampled defender hands that end at or below `myDeadwood` once
 * layoffs land — the chance a knock right now LOSES or undercuts against us.
 * Samples lean on inference so an appetite-heavy opponent reads as stronger.
 */
export function knockSurvival(ctx: BrainContext, myDeadwood: number, samples: number): number {
  const opp = opponentSeat(ctx);
  const pool = unseenPool(ctx.view, ctx.seat);
  if (pool.length < HAND_SIZE) return 1;

  const appetite = inferAppetite(ctx);
  const knockerMelds = bestPartition(ownHand(ctx)).melds;
  let escapes = 0;
  const tries = Math.max(1, Math.min(samples, 48));
  for (let i = 0; i < tries; i++) {
    const sample = drawSample(ctx.rng, pool, HAND_SIZE, appetite);
    const partition = bestPartition(sample);
    const laidOff = estimateLayoffs(partition.deadwoodCards, knockerMelds);
    const final =
      Math.max(0, partition.deadwood - laidOff) + ctx.params.opponentUplift;
    if (final <= myDeadwood) escapes += 1;
  }
  return escapes / tries;
}

function drawSample(
  rng: import('@parlour/engine').Rng,
  pool: readonly CardId[],
  count: number,
  appetite: Map<CardId, number>,
): CardId[] {
  const weighted = [...pool];
  const picked: CardId[] = [];
  for (let i = 0; i < count && weighted.length > 0; i++) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let w = 0; w < Math.min(weighted.length, 6); w++) {
      const index = rng.int(weighted.length);
      const score = rng.float() + (appetite.get(weighted[index]!) ?? 0) / 12;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    picked.push(weighted.splice(bestIndex, 1)[0]!);
  }
  return picked;
}

/** Rough layoff credit for a sample hand against our melds. */
function estimateLayoffs(
  deadwoodCards: readonly CardId[],
  knockerMelds: ReturnType<typeof bestPartition>['melds'],
): number {
  let points = 0;
  for (const meld of knockerMelds) {
    if (meld.kind === 'set') {
      if (meld.cards.length >= 4) continue;
      if (deadwoodCards.some((card) => rankOf(card) === rankOf(meld.cards[0]!))) points += 10;
    } else {
      const ranks = meld.cards.map(rankOf);
      const low = Math.min(...ranks);
      const high = Math.max(...ranks);
      const suit = suitOf(meld.cards[0]!);
      for (const edge of [low - 1, high + 1]) {
        if (edge < 1 || edge > 13) continue;
        const id = `${suit}${edge}` as CardId;
        if (deadwoodCards.includes(id)) points += pipValue(id);
      }
    }
  }
  return points;
}

/** How much the opponent likely wants this exact card. */
export function discardDanger(ctx: BrainContext, card: CardId): number {
  return inferAppetite(ctx).get(card) ?? 0;
}
