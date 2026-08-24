import { stdDeck, type LegalMove } from '@parlour/engine';
import { cardValue } from '../cards';
import { pegPlayScore } from '../score';
import type { Rng } from '@parlour/engine';
import { answerRisk, sampleStarters, unseenCards } from './shared';
import type { BotParams } from './params';
import type { CribbageState } from '../state';

export function findMove(legal: readonly LegalMove[], id: string): LegalMove | undefined {
  return legal.find((move) => move.id === id);
}

export function playPayloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

/**
 * Shared pegging evaluator.
 *
 * Tier signal comes from `params.replySamples`: when above zero the bot
 * simulates the opponent's best answer from the unseen pool for every
 * candidate card (pair/run/fifteen traps) and prices that into the choice,
 * alongside go-denial pressure. Low tiers just take visible points with a
 * dash of high-card dumping.
 */
export function choosePeggingPlay(
  state: CribbageState,
  seat: number,
  legal: readonly LegalMove[],
  rng: Rng,
  params: BotParams,
): LegalMove | null {
  const plays = legal
    .map((move) => ({ move, card: playPayloadCard(move) }))
    .filter((entry): entry is { move: LegalMove; card: string } => entry.card !== null);
  if (plays.length === 0) return null;

  const leaderTotal = Math.max(...state.totals);
  const myTotal = state.totals[seat] ?? 0;
  const ahead = myTotal >= leaderTotal;
  const pool = unseenCards(state, seat);
  const samples = params.replySamples > 0 ? sampleStarters(pool, rng, params.replySamples) : [];
  const risk = answerRisk(state.pegging.pile, pool);

  let best: { move: LegalMove; value: number } | null = null;
  for (const entry of plays) {
    const peg = pegPlayScore(state.pegging.pile, entry.card);
    const countAfter = state.pegging.count + cardValue(entry.card);
    let value = peg.points * 2;

    if (samples.length > 0) {
      // what does this play hand the opponent? price their best answer in
      let worstReply = 0;
      let stuckReplies = 0;
      for (const sample of samples) {
        if (countAfter + cardValue(sample) > 31) {
          stuckReplies += 1;
          continue; // they would have to say go — good for us
        }
        const reply = pegPlayScore([...state.pegging.pile, entry.card], sample);
        if (reply.points > worstReply) worstReply = reply.points;
      }
      value -= (worstReply / samples.length) * params.trapWeight * (ahead ? 3 : 2);
      value += (stuckReplies / samples.length) * params.goPressure;

      // count control: keep room to play later when protecting a lead
      if (ahead && countAfter > 25) value -= 0.4;
      // dump dangerous high cards early while the count is safe
      if (countAfter <= 20 && cardValue(entry.card) >= 10) value += 0.35;
      // hoard low cards for late-sequence control
      value += ahead ? -cardValue(entry.card) * 0.02 : 0;
    } else {
      value -= risk * params.caution * (ahead ? 1 : -0.5);
      value += cardValue(entry.card) * (state.pegging.count <= 10 ? 0.12 : -0.08);
    }

    if (31 - countAfter <= 3 && peg.points > 0) value += 1;
    value += rng.float() * 0.15;
    if (!best || value > best.value) best = { move: entry.move, value };
  }
  return best?.move ?? null;
}

/** Immediate pairs/fifteens inside a keep, ignoring the starter (easy tier). */
export function keepBaseValue(keep: readonly string[]): number {
  let value = 0;
  for (let a = 0; a < keep.length; a++) {
    for (let b = a + 1; b < keep.length; b++) {
      const first = keep[a] as string;
      const second = keep[b] as string;
      if (first.slice(1) === second.slice(1)) value += 2;
      else if (cardValue(first) + cardValue(second) === 15) value += 2;
    }
  }
  return value;
}

export function deckSize(): number {
  return stdDeck().cardIds.length;
}
