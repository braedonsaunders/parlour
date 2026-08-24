import type { SeatId } from '@parlour/engine';
import { UNDERCUT_BONUS_POINTS } from './config';
import { pipValue } from './cards';
import { bestPartition, findLayoffs } from './melds';
import type { GinState, HandOutcome } from './state';

export const HAND_SIZE = 10;

/**
 * Scores a completed hand. The knocker's best partition is laid out first;
 * on a plain knock the defender lays off every card that fits (maximally —
 * there is never a reason to hold back), then deadwoods are compared:
 *
 * - knocker deadwood 0 → gin (or big gin holding eleven melded cards): the
 *   defender pays their full deadwood plus the gin bonus. No layoffs.
 * - defender deadwood ≤ knocker deadwood → undercut: the difference plus the
 *   undercut bonus swings to the defender.
 * - otherwise the knocker scores the difference.
 * - a dead hand (stock starved) scores nothing for anyone.
 */
export function scoreHand(state: GinState): HandOutcome {
  const config = state.rules;
  const knockerSeat = state.knocker;

  if (knockerSeat === null) {
    return {
      reason: 'dead-hand',
      knocker: null,
      scorer: null,
      points: 0,
      layoffs: [],
      deadwood: [0, 0],
      handScores: Array.from({ length: state.seats }, () => 0),
    };
  }

  const defenderSeat = otherSeat(knockerSeat);
  const knockerHand = state.hands[knockerSeat] ?? [];
  const defenderHand = state.hands[defenderSeat] ?? [];

  const knockerPartition = bestPartition(knockerHand);
  const defenderPartition = bestPartition(defenderHand);

  if (knockerPartition.deadwood === 0) {
    const bigGin = config.bigGin && knockerHand.length > HAND_SIZE;
    const bonus = bigGin ? config.bigGinBonus : config.ginBonus;
    const points = defenderPartition.deadwood + bonus;
    return {
      reason: bigGin ? 'big-gin' : 'gin',
      knocker: knockerSeat,
      scorer: knockerSeat,
      points,
      layoffs: [],
      deadwood: [0, defenderPartition.deadwood],
      handScores: spread(state.seats, knockerSeat, points),
    };
  }

  // plain knock: the defender sheds onto the knocker's melds before comparing
  const { layoffs } = findLayoffs(knockerPartition.melds, defenderPartition.deadwoodCards);
  const laidOffPoints = layoffs.reduce((sum, layoff) => sum + pipValue(layoff.card), 0);
  const defenderDeadwood = Math.max(0, defenderPartition.deadwood - laidOffPoints);
  const finalDeadwood = [knockerPartition.deadwood, defenderDeadwood];

  if (defenderDeadwood <= knockerPartition.deadwood) {
    const points =
      knockerPartition.deadwood - defenderDeadwood + UNDERCUT_BONUS_POINTS;
    return {
      reason: 'undercut',
      knocker: knockerSeat,
      scorer: defenderSeat,
      points,
      layoffs,
      deadwood: finalDeadwood,
      handScores: spread(state.seats, defenderSeat, points),
    };
  }

  const points = defenderDeadwood - knockerPartition.deadwood;
  return {
    reason: 'knock',
    knocker: knockerSeat,
    scorer: knockerSeat,
    points,
    layoffs,
    deadwood: finalDeadwood,
    handScores: spread(state.seats, knockerSeat, points),
  };
}

export { otherSeat as opposingSeat };

function otherSeat(seat: SeatId): SeatId {
  return seat === 0 ? 1 : 0;
}

function spread(seats: number, scorer: SeatId, points: number): number[] {
  const scores = Array.from({ length: seats }, () => 0);
  scores[scorer] = points;
  return scores;
}
